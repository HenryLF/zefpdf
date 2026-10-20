/** Anything thrown, as something displayable. */
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
