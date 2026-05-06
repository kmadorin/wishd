export function isStale(staleAfter: number | undefined, nowMs: number = Date.now()): boolean {
  if (staleAfter === undefined) return false;
  return nowMs >= staleAfter;
}
