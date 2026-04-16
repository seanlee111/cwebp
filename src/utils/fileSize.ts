/** Format a byte count into a human-readable string (B / KB / MB / GB). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${units[i]}`;
}

/** Percentage change from `original` to `output`, e.g. "-73%" or "+12%". */
export function formatSavings(original: number, output: number): string {
  if (original <= 0) return '—';
  const delta = (output - original) / original;
  const sign = delta < 0 ? '-' : '+';
  return `${sign}${Math.abs(delta * 100).toFixed(0)}%`;
}
