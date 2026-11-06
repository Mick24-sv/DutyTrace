// A correction invalidates a previous verification until the new times are reviewed.
export function matchesVerification(session, verification) {
  return session.counted && session.seconds > 0 && session.id === verification.session_id
    && session.timeIn === new Date(verification.time_in).toISOString()
    && session.timeOut === new Date(verification.time_out).toISOString()
    && session.seconds === verification.seconds;
}
