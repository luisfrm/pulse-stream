"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

import { cn } from "./utils";
import { Input } from "./input";

const selectTriggerVariants = cva(
  "relative flex items-center justify-between gap-2 border rounded-xl transition-colors focus-within:outline-none focus-visible:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-bg-elevated border-bg-highlight hover:bg-bg-highlight/50 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400",
        glass: "bg-bg-highlight/40 border-bg-highlight hover:bg-bg-highlight/60 focus-within:border-brand-400",
      },
      inputSize: {
        sm: "h-10 text-xs",
        base: "h-12 text-sm",
        lg: "h-14 text-base",
      },
      state: {
        default: "",
        error: "border-brand-900 focus-within:border-brand-900 focus-within:ring-brand-900",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "base",
      state: "default",
    },
  }
);

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

interface SelectProps<T extends string = string>
  extends Omit<React.ComponentProps<"button">, "onChange" | "value" | "size">,
    VariantProps<typeof selectTriggerVariants> {
  options: SelectOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string;
  searchable?: boolean;
  emptyLabel?: string;
  /** Called whenever the search input changes (or resets on close). */
  onSearchChange?: (query: string) => void;
  /** Shows a subtle loading indicator while remote options are being fetched. */
  loading?: boolean;
}

/**
 * Select (combobox + listbox) accesible:
 * - abre/cierra con Enter/Espacio y con click
 * - navegación por teclado (↑ ↓, Enter para elegir, Escape para cerrar)
 * - opcionalmente buscable (filtra las opciones)
 * - `role="listbox"` + `aria-activedescendant` para lectores de pantalla
 */
export function Select<T extends string = string>({
  className,
  variant,
  inputSize,
  state,
  options,
  value,
  onChange,
  placeholder = "Seleccioná…",
  label,
  searchable = false,
  emptyLabel = "Sin opciones",
  onSearchChange,
  loading = false,
  disabled,
  ...props
}: SelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const onSearchChangeRef = React.useRef(onSearchChange);
  const queryRef = React.useRef(query);
  const generatedId = React.useId();
  const listboxId = `${generatedId}-listbox`;

  React.useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
    queryRef.current = query;
  }, [onSearchChange, query]);

  const resetSearch = React.useCallback(() => {
    if (queryRef.current !== "") {
      setQuery("");
      onSearchChangeRef.current?.("");
    }
  }, []);

  const closeDropdown = React.useCallback(() => {
    setOpen(false);
    resetSearch();
  }, [resetSearch]);

  const selected = options.find((o) => o.value === value);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = searchable && normalizedQuery
    ? options.filter((o) =>
        o.label.toLowerCase().includes(normalizedQuery)
      )
    : options;

  React.useEffect(() => {
    if (!open) return;
    // pequeño delay para que el input exista y reciba foco
    const t = window.setTimeout(() => searchRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeDropdown();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDropdown();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeDropdown]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const option = filtered[highlighted];
      if (option) {
        onChange(option.value);
        closeDropdown();
      }
    } else if (e.key === "Enter" || e.key === " ") {
      if (!open) {
        e.preventDefault();
        setOpen(true);
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("w-full", className)}>
      {label && (
        <label htmlFor={generatedId} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
      )}

      <button
        id={generatedId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (open) {
            closeDropdown();
          } else {
            resetSearch();
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        data-state={open ? "open" : "closed"}
        className={cn(
          selectTriggerVariants({ variant, inputSize, state }),
          "px-3.5 text-left text-text-primary placeholder:text-text-subdued disabled:pointer-events-none disabled:opacity-40",
          className
        )}
        {...props}
      >
        <span className={cn("truncate", !selected && "text-text-subdued")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-text-subdued transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label ?? placeholder}
          className="animate-dropdown-in mt-1.5 max-h-64 overflow-auto rounded-xl border border-bg-highlight bg-bg-elevated p-1.5 shadow-xl"
        >
          {searchable && (
            <div className="mb-1 border-b border-bg-highlight px-2 pb-1.5">
              <Input
                ref={searchRef}
                inputSize="sm"
                wrapperClassName="h-9"
                type="text"
                value={query}
                onChange={(e) => {
                  const nextQuery = e.target.value;
                  setQuery(nextQuery);
                  setHighlighted(0);
                  onSearchChange?.(nextQuery);
                }}
                placeholder="Buscar…"
                leftIcon={<Search size={14} />}
              />
            </div>
          )}

          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 px-2 py-2 text-xs text-text-subdued"
            >
              <Loader2 size={13} className="shrink-0 animate-spin" aria-hidden />
              <span>Buscando…</span>
            </p>
          )}

          {filtered.length === 0 ? (
            !loading && (
              <p className="px-2 py-3 text-sm text-text-subdued">{emptyLabel}</p>
            )
          ) : (
            filtered.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlighted;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  id={`${listboxId}-${index}`}
                  onPointerEnter={() => setHighlighted(index)}
                  onClick={() => {
                    onChange(option.value);
                    closeDropdown();
                  }}
                  style={{ animationDelay: `${Math.min(index, 8) * 20}ms` }}
                  className={cn(
                    "animate-option-in flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
                    isHighlighted
                      ? "bg-bg-highlight text-text-primary"
                      : "text-text-primary",
                    isSelected && "text-brand-400"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-text-subdued">
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={16} className="shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
