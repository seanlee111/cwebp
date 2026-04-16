import { useCallback, useEffect, useState } from 'react';

/**
 * State hook that syncs to localStorage.
 * Values are JSON-serialised; failures (quota, parse errors) fall back gracefully.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): readonly [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded / private mode — intentionally silent for MVP.
    }
  }, [key, value]);

  const setter = useCallback((v: T) => setValue(v), []);
  return [value, setter] as const;
}
