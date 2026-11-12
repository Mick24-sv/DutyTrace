export const PULL_REFRESH_THRESHOLD = 68;

// As the finger travels farther, each additional pixel moves the list less.
export function pullRefreshDistance(distance) {
  return 112 * (1 - Math.exp(-Math.max(0, distance) / 190));
}
