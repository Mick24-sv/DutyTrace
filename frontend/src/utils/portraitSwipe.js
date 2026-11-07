export function portraitSwipeDirection(start, end) {
  const dx=end.x-start.x;
  const dy=end.y-start.y;
  if (Math.abs(dx)<48 || Math.abs(dx)<Math.abs(dy)*1.3) return 0;
  return dx<0?1:-1;
}
