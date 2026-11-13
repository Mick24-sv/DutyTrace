// Reports paths/counts only. Never print secret values or matching source lines.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),envFile=path.join(root,'backend/.env');
const keys=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8').split(/\r?\n/).map(line=>line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1]).filter(Boolean):[];
if(fs.existsSync(envFile))process.loadEnvFile(envFile);
const secrets=keys.filter(key=>/PASSWORD|SECRET|TOKEN|PRIVATE_KEY|BREVO_API_KEY|SMTP_PASS|DATABASE_URL/.test(key)).map(key=>process.env[key]).filter(value=>value?.length>=12);
try{const password=decodeURIComponent(new URL(process.env.DATABASE_URL).password);if(password.length>=12)secrets.push(password);}catch{}
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const files=new Set(tracked.filter(file=>/\.(js|mjs|jsx|ts|tsx|json|css|html|sql|md|txt|ya?ml)$|\.env(?:\.|$)/.test(file)));
function walk(folder){if(!fs.existsSync(folder))return;for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const name=path.join(folder,entry.name);if(entry.isDirectory())walk(name);else if(/\.(js|css|html|map)$/.test(name))files.add(path.relative(root,name));}}
walk(path.join(root,'frontend/dist'));
const exposed=[];for(const file of files){const absolute=path.join(root,file);if(fs.existsSync(absolute)&&secrets.some(secret=>fs.readFileSync(absolute,'utf8').includes(secret)))exposed.push(file);}
const trackedEnv=tracked.filter(file=>/(^|\/)\.env($|\.)/.test(file)&&!file.endsWith('.example'));
console.log(JSON.stringify({filesScanned:files.size,configuredSecretValuesChecked:secrets.length,exposedFiles:exposed,trackedEnvironmentFiles:trackedEnv,sourceMaps:fs.existsSync(path.join(root,'frontend/dist/assets'))?fs.readdirSync(path.join(root,'frontend/dist/assets')).filter(file=>file.endsWith('.map')).length:0}));
if(exposed.length||trackedEnv.length)process.exitCode=1;
