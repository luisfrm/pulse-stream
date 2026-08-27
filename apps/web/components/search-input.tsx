"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

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

    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [debouncedValue, paramName, router, searchParams]);

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
