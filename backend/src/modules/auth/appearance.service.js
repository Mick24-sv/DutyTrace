import {z} from 'zod';
import {query} from '../../db/pool.js';
export const DEFAULT_APPEARANCE={theme:'light',accent:'teal',density:'comfortable'};
export const appearanceSchema=z.object({theme:z.enum(['light','dark','system']),accent:z.enum(['teal','blue','violet','rose','amber']),density:z.enum(['comfortable','compact'])}).strict();
export async function getAppearance(user,db={query}) {
 const {rows:[row]}=await db.query('SELECT theme,accent,density FROM user_appearance_preferences WHERE user_id=$1',[user.id]);
 return {appearance:row??{...DEFAULT_APPEARANCE}};
}
export async function saveAppearance(user,input,db={query}) {
 input=appearanceSchema.parse(input);
 const {rows:[row]}=await db.query(`INSERT INTO user_appearance_preferences(user_id,theme,accent,density)
  VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET theme=EXCLUDED.theme,accent=EXCLUDED.accent,density=EXCLUDED.density,updated_at=now()
  RETURNING theme,accent,density`,[user.id,input.theme,input.accent,input.density]);
 return {appearance:row};
}
