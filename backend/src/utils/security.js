import {createHash,timingSafeEqual} from 'node:crypto';
export const SESSION_TOKEN=/^[A-Za-z0-9_-]{43}$/;
export function secureSecretEquals(expected,provided){
 if(typeof expected!=='string'||expected.length<32||typeof provided!=='string'||provided.length>512)return false;
 return timingSafeEqual(createHash('sha256').update(expected).digest(),createHash('sha256').update(provided).digest());
}
