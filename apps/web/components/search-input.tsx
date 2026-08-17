"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useDebounce } from "@/lib/hooks/use-debounce";

interface SearchInputProps {
  readonly initialValue: string;
  readonly paramName?: string;
  readonly placeholder?: string;
}

/**
 * Búsqueda desacoplada: el estado vive en la URL (searchParams). Al escribir,
 * con debounce, se hace router.push a `?q=...` y el RSC re-ejecuta el fetch.
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

  useEffect(() => {
    const currentQuery = searchParams.get(paramName) ?? "";
    if (debouncedValue === currentQuery) return;

    const params = new URLSearchParams(searchParams.toString());
    if (debouncedValue) {
      params.set(paramName, debouncedValue);
    } else {
      params.delete(paramName);
    }
    // Al buscar volvemos al inicio de la lista (offset 0)
    params.delete("offset");

    router.push(`?${params.toString()}`);
  }, [debouncedValue, paramName, router, searchParams]);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
    />
  );
}
