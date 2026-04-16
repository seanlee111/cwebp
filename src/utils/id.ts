/**
 * Generate a unique id. Uses `crypto.randomUUID` where available
 * (all target browsers: Chrome 92+/Safari 15.4+/Firefox 95+).
 */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Unlikely fallback for very old browsers — acceptable for MVP.
  return `id-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
}
