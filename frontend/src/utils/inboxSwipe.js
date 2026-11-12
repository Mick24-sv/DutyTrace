export function swipeRelease(offset, width) {
  if (offset <= -Math.max(180, width * .72)) return 'delete';
  if (offset < -48) return 'right';
  if (offset > 36) return 'left';
  return 'closed';
}
