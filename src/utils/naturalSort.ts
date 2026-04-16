/**
 * Natural string comparison that handles embedded digits the way humans do:
 *   naturalCompare('img_2.png', 'img_10.png') < 0
 * Uses the browser-native Intl-backed `localeCompare` with `numeric: true`.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
