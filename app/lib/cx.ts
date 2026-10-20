/**
 * Join class names, dropping anything falsy.
 *
 * With CSS Modules the names are hashed, so the string templates this replaces
 * (`` `card${active ? " cursor" : ""}` ``) can no longer be written by hand.
 */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
