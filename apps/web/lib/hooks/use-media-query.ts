"use client";

import * as React from "react";

/**
 * `true` cuando el viewport matchea `query` (p. ej. `(min-width: 640px)`).
 *
 * El inicializador lee `matchMedia` en el primer render (el fullscreen se carga
 * con `ssr: false`, así que no hay mismatch) y el efecto solo se suscribe a los
 * cambios: no hace `setMatches` al montar (regla del React Compiler
 * `set-state-in-effect`).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
