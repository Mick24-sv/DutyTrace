import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safePagePath,browserLabel,canReadReport,reportInput,updateInput} from '../src/modules/problem-reports/problem-reports.rules.js';
import {createReport,inboxSummary,myReports,updateReport} from '../src/modules/problem-reports/problem-reports.service.js';
test('context discards query strings, fragments, identifiers, unknown routes and cross-role paths',()=>{
 assert.equal(safePagePath('/student/scan?qr=secret#token','student'),'/student/scan');
 assert.equal(safePagePath('/admin/users/private-record-id','admin'),'/admin/users');
 assert.equal(safePagePath('https://evil.example/admin/users','admin'),'/admin');
 assert.equal(safePagePath('/supervisor/assistants','student'),'/student');
 assert.equal(safePagePath('/student/unknown-secret-path','student'),'/student');
 assert.equal(browserLabel('Chrome/123 Edg/123 token=secret'),'Microsoft Edge');
 assert.equal(browserLabel('custom-agent secret'),'Other browser');
});
test('only the reporter in the original institution or a superadmin can read screenshots',()=>{
 const row={reporter_id:'student-a',institution_id:'school-a'};
 assert.equal(canReadReport({id:'student-a',institutionId:'school-a',role:'student'},row),true);
 assert.equal(canReadReport({id:'student-b',institutionId:'school-a',role:'admin'},row),false);
 assert.equal(canReadReport({id:'student-a',institutionId:'school-b',role:'student'},row),false);
 assert.equal(canReadReport({role:'superadmin'},row),true);
 assert.equal(canReadReport({role:'superadmin'},null),false);
});
test('report bodies cannot choose reporter, institution, browser diagnostics or status',()=>{
 const valid={title:'A report title',description:'The page did not work.',expected:'The page should load.',category:'display',pagePath:'/student'};
 assert.equal(reportInput.safeParse(valid).success,true);
 for(const key of ['reporterId','institutionId','status','browser','password'])assert.equal(reportInput.safeParse({...valid,[key]:'spoofed'}).success,false);
 assert.equal(updateInput.safeParse({status:'resolved',response:''}).success,false);
 assert.equal(updateInput.safeParse({status:'resolved',response:'Fixed the display issue.'}).success,true);
});
test('role checks reject unauthorized operations before database access',async()=>{
 await assert.rejects(()=>createReport({actor:{role:'superadmin'},input:{}}),{status:403});
 await assert.rejects(()=>inboxSummary({role:'admin'}),{status:403});
 await assert.rejects(()=>myReports({role:'student',institutionId:null}),{status:403});
 await assert.rejects(()=>updateReport({actor:{role:'student'},input:{}}),{status:403});
});
