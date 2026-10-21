"use client";

import { useEffect, useState } from "react";

/** Devuelve `value` tras `delay` ms sin cambios (para búsquedas en la URL). */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
