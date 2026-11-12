import { z } from 'zod';
import { query } from '../../db/pool.js';

export const TUTORIAL_VERSION = 1;
export const TUTORIAL_STEP_COUNT = 6;
export const tutorialProgressSchema = z.object({
  stepIndex: z.number().int().min(0).max(TUTORIAL_STEP_COUNT - 1),
  status: z.enum(['in_progress', 'completed', 'dismissed']),
}).strict().refine(value => value.status !== 'completed' || value.stepIndex === TUTORIAL_STEP_COUNT - 1,
  { message: 'Complete the final tutorial step.', path: ['stepIndex'] });

export async function getTutorialProgress(user, db = { query }) {
  const { rows: [progress] } = await db.query(`SELECT step_index AS "stepIndex",status,updated_at AS "updatedAt"
    FROM user_tutorial_progress WHERE user_id=$1 AND role=$2 AND version=$3`, [user.id, user.role, TUTORIAL_VERSION]);
  return { version: TUTORIAL_VERSION, stepCount: TUTORIAL_STEP_COUNT, progress: progress ?? null };
}

export async function saveTutorialProgress(user, input, db = { query }) {
  const { rows: [progress] } = await db.query(`INSERT INTO user_tutorial_progress(user_id,role,version,step_index,status)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,role,version) DO UPDATE
    SET step_index=EXCLUDED.step_index,status=EXCLUDED.status,updated_at=now()
    RETURNING step_index AS "stepIndex",status,updated_at AS "updatedAt"`, [user.id, user.role, TUTORIAL_VERSION, input.stepIndex, input.status]);
  return { version: TUTORIAL_VERSION, progress };
}
