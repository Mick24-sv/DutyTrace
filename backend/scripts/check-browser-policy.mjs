// Tests the built app with the configured production headers and fake local API responses.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {mkdtemp,readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../frontend/dist/',import.meta.url));
const headers=JSON.parse(fs.readFileSync(new URL('../../frontend/vercel.json',import.meta.url),'utf8')).headers[0].headers;
let authenticated=false;
const user={id:'policy-test',role:'superadmin',fullName:'Policy Test',email:'test@example.invalid'};
const server=http.createServer((req,res)=>{
 for(const {key,value} of headers)res.setHeader(key,value);
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');let data={};
  if(pathname==='/api/auth/login'){authenticated=true;data={user};}
  else if(pathname==='/api/auth/me'){if(!authenticated){res.statusCode=401;res.end(JSON.stringify({success:false,error:{message:'Sign in'}}));return;}data={user};}
  else if(pathname==='/api/platform/institutions')data={institutions:[],summary:{total:0,active:0,awaitingSetup:0}};
  else if(pathname==='/api/problem-reports/summary')data={new:0,investigating:0,resolved:0,total:0};
  res.end(JSON.stringify({success:true,data}));return;
 }
 let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root)){res.statusCode=403;res.end();return;}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
 const type={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';res.setHeader('Content-Type',type);res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
const profile=await mkdtemp(path.join(os.tmpdir(),'duty-csp-'));const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let ws;
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
try{
 let debug;for(let i=0;i<80;i++){try{debug=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}assert.ok(debug);
 const tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));let id=0;const jobs=new Map(),errors=[],violations=[];
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const job=jobs.get(message.id);jobs.delete(message.id);message.error?job.reject(message.error):job.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);if(message.method==='Log.entryAdded'&&/Content Security Policy|Refused to/.test(message.params.entry.text))violations.push(message.params.entry.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;jobs.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw new Error(JSON.stringify({expression,errors,violations}));};
 await send('Runtime.enable');await send('Log.enable');await send('Page.navigate',{url:`http://127.0.0.1:${port}/login`});
 await wait('Boolean(document.querySelector("input[type=password]"))');
 await evaluate(`(()=>{for(const [type,value] of [['email','test@example.invalid'],['password','fake-policy-test-password']]){const input=document.querySelector('input[type='+type+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
 await evaluate('document.querySelector("form").requestSubmit()');await wait('document.body.textContent.includes("Institution management")');assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
 console.log(JSON.stringify({productionCsp:'passed',loginAnimation:'passed',dashboard:'rendered',cspViolations:0,realApiCalls:false}));await send('Browser.close');
}finally{ws?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
