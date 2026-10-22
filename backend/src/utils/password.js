import bcrypt from 'bcryptjs';

// bcrypt with cost 12 (~250 ms): slow on purpose, so guessing is expensive.
const COST = 12;
export const MIN_PASSWORD_LENGTH = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// A real hash of a throwaway string. Login compares against this when the
// email is unknown, so "unknown email" and "wrong password" take similar time
// and attackers can't discover which emails exist.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);
