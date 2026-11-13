import {fileURLToPath} from 'node:url';
import {closePool,withTransaction} from './pool.js';
import {invitationInput} from '../modules/platform/platform.rules.js';
import {hashPassword,MIN_PASSWORD_LENGTH} from '../utils/password.js';
import {recordAudit} from '../modules/audit/audit.service.js';

export async function createSuperadmin({email,fullName,password}) {
  const input=invitationInput.parse({email,fullName});
  if(typeof password!=='string'||password.length<MIN_PASSWORD_LENGTH||password.length>200) throw new Error(`Use a password between ${MIN_PASSWORD_LENGTH} and 200 characters.`);
  const passwordHash=await hashPassword(password);
  return withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext('platform-bootstrap'))");
    const {rows:existing}=await db.query("SELECT id FROM users WHERE role='superadmin' OR email=$1",[input.email]);
    if(existing.length) throw new Error('A maintainer already exists, or that email is already in use. No existing account was changed.');
    const {rows:[user]}=await db.query(`INSERT INTO users(email,password_hash,full_name,role,institution_id)
      VALUES($1,$2,$3,'superadmin',NULL) RETURNING id`,[input.email,passwordHash,input.fullName]);
    await recordAudit({actorId:user.id,action:'platform.superadmin_created',targetType:'user',targetId:user.id,after:{role:'superadmin'}},db);
    return user;
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  createSuperadmin({email:process.env.SUPERADMIN_EMAIL,fullName:process.env.SUPERADMIN_NAME,password:process.env.SUPERADMIN_PASSWORD})
    .then(()=>console.log('Separate platform maintainer account created. Existing school accounts were not changed.'))
    .catch(error=>{console.error(error.message);process.exitCode=1;}).finally(closePool);
}
