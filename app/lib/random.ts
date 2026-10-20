/** One item from `list`, or null when it is empty. */
export function randomItem<T>(list: readonly T[]): T | null {
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)]!;
}
