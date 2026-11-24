"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface SearchInputProps {
  readonly initialValue: string;
  readonly paramName?: string;
  readonly placeholder?: string;
}

/**
 * Búsqueda desacoplada: el estado vive en la URL (searchParams). Al escribir,
 * con debounce, se hace router.replace a `?q=...` y el RSC re-ejecuta el fetch.
 * replace + scroll:false evita ensuciar el historial y el salto al top.
 */
export function SearchInput({
  initialValue,
  paramName = "q",
  placeholder = "Buscar…",
}: SearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const debouncedValue = useDebounce(value, 400);

  /**
   * Último valor que ESTE input escribió en la URL. Distingue el eco del
   * `router.replace` propio (no se adopta) de un cambio EXTERNO de la URL
   * (Atrás/Adelante, link de género, ✕ de un chip, `router.refresh`), que sí
   * se adopta. Sin esto el estado local quedaba viejo y el debounce
   * re-navegaba al valor anterior: la URL "volvía sola" y cada replace
   * re-montaba el Suspense de la página (skeletons en loop).
   */
  const lastNavigatedRef = useRef(initialValue);
  /**
   * Se enciende cuando la URL cambió por fuera y se adopta el valor nuevo. El
   * efecto de navegación corre en el MISMO commit (antes de que el `setValue`
   * de la adopción re-renderice) y con `debounced === value === viejo` haría un
   * replace fantasma al valor anterior; este flag lo hace saltar ese run.
   */
  const adoptingRef = useRef(false);

  useEffect(() => {
    if (initialValue === lastNavigatedRef.current) return;
    lastNavigatedRef.current = initialValue;
    adoptingRef.current = true;
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (adoptingRef.current) {
      adoptingRef.current = false;
      return;
    }
    // Mientras el debounce no alcanzó al valor local (tipeo en curso o una
    // adopción externa recién aplicada) NO se navega: si no, se haría un
    // replace con el valor VIEJO justo cuando la URL cambió por fuera.
    if (debouncedValue !== value) return;

    const currentQuery = searchParams.get(paramName) ?? "";
    if (debouncedValue === currentQuery) return;
    // La URL cambió por fuera (Atrás/Adelante): `useSearchParams` flipa antes
    // de que llegue el prop RSC con el `initialValue` nuevo. Si el debounce es
    // igual a lo último que navegamos y la URL ya no coincide, NO re-navegar:
    // sería el replace fantasma al valor viejo (la adopción lo aplica después).
    if (debouncedValue === lastNavigatedRef.current) return;

    const params = new URLSearchParams(searchParams.toString());
    // Se mergea sobre los params actuales: filtros que no son `paramName`
    // (p. ej. `genre` en /songs) se conservan al buscar.
    if (debouncedValue) {
      params.set(paramName, debouncedValue);
    } else {
      params.delete(paramName);
    }
    // Al buscar volvemos al inicio de la lista (offset 0)
    params.delete("offset");

    // Se registra ANTES del replace: cuando el RSC re-renderice con el nuevo
    // `initialValue`, el effect de arriba lo reconoce como eco propio.
    lastNavigatedRef.current = debouncedValue;

    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [debouncedValue, value, paramName, router, searchParams]);

  return (
    <div className="relative w-full">
      <Input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        leftIcon={<Search size={16} />}
        aria-label={placeholder}
      />
    </div>
  );
}
