/**
 * A series or station position from a route param: whole digits, at least 1,
 * else null. `Number('1.5')` and `Number('1e3')` would otherwise reach the
 * queries and could be saved as a position no device can show (#837).
 */
export function routePosition(param: string | undefined): number | null {
  if (param === undefined || !/^\d{1,6}$/.test(param)) return null;
  const position = Number(param);
  return position >= 1 ? position : null;
}
