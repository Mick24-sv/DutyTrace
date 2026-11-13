import {test} from 'node:test';
import assert from 'node:assert/strict';
import {institutionInput,acceptInput,tokenHash,requireSuperadmin,validateInvitation} from '../src/modules/platform/platform.rules.js';

const institution={name:' Example College ',shortName:' EX ',type:'college',address:'Main campus',city:'Naga City',contactEmail:' OFFICE@EXAMPLE.EDU ',admin:{fullName:' School Admin ',email:' ADMIN@EXAMPLE.EDU '}};
test('institution onboarding validates and normalizes metadata without accepting a role or institution override',()=>{
  const input=institutionInput.parse(institution);
  assert.equal(input.name,'Example College');assert.equal(input.contactEmail,'office@example.edu');assert.equal(input.admin.email,'admin@example.edu');
  assert.equal(input.timezone,'Asia/Manila');
  assert.equal(institutionInput.safeParse({...institution,admin:{...institution.admin,role:'superadmin'}}).success,false);
  assert.equal(institutionInput.safeParse({...institution,institutionId:'other-school'}).success,false);
  assert.equal(institutionInput.safeParse({...institution,timezone:'Invalid/Zone'}).success,false);
  assert.equal(institutionInput.safeParse({...institution,type:'other'}).success,false);
});
test('only an explicit superadmin can manage institutions',()=>{
  for(const role of ['student','supervisor','admin',undefined]) assert.throws(()=>requireSuperadmin({role}),{status:403});
  assert.doesNotThrow(()=>requireSuperadmin({role:'superadmin'}));
});
test('invitations are invalid after expiry, revocation or acceptance',()=>{
  const now=new Date('2026-11-13T12:00:00Z');const valid={expires_at:'2026-11-15T12:00:00Z'};
  assert.doesNotThrow(()=>validateInvitation(valid,now));
  for(const invalid of [null,{...valid,expires_at:now},{...valid,revoked_at:now},{...valid,accepted_at:now}]) assert.throws(()=>validateInvitation(invalid,now),{code:'INVALID_INVITATION'});
});
test('only the hash is suitable for storage and acceptance cannot choose another role or institution',()=>{
  const token='A'.repeat(43);assert.equal(tokenHash(token).length,64);assert.notEqual(tokenHash(token),token);
  assert.equal(acceptInput.safeParse({token,password:'long-password'}).success,true);
  assert.equal(acceptInput.safeParse({token,password:'short'}).success,false);
  assert.equal(acceptInput.safeParse({token,password:'long-password',role:'superadmin'}).success,false);
  assert.equal(acceptInput.safeParse({token,password:'long-password',institutionId:'other-school'}).success,false);
});
