import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleX, Loader2 } from "lucide-react";

import { cn } from "./utils";

const inputWrapperVariants = cva(
  "relative flex items-center border rounded-xl transition-colors focus-within:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-bg-elevated border-bg-highlight hover:bg-bg-highlight/50 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400",
      },
      inputSize: {
        // text-base (16px) debajo de lg: iOS hace zoom automático al enfocar
        // inputs con font < 16px. En lg+ vuelve al tamaño original.
        sm: "h-10 text-base lg:text-xs",
        base: "h-12 text-base lg:text-sm",
        lg: "h-14 text-base",
      },
      state: {
        default: "",
        error: "border-brand-900 focus-within:border-brand-900 focus-within:ring-brand-900",
        loading: "",
        success: "border-brand-400 focus-within:border-brand-400 focus-within:ring-brand-400",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "base",
      state: "default",
    },
  }
);

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputWrapperVariants> {
  label?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  /** Solo aplica a type="number": bloquea "-" y "e" (exponente). Default: false. */
  allowNegative?: boolean;
  /** Clases extra para el wrapper (el className del consumidor va al input interno). */
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      wrapperClassName,
      variant,
      inputSize,
      state,
      label,
      hint,
      leftIcon,
      rightElement,
      allowNegative = false,
      id,
      disabled,
      type,
      onChange,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    const hasRightElement =
      Boolean(rightElement) || state === "error" || state === "loading";

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      if (type === "number") {
        const value = e.target.value;
        // Bloquea "-" y "e" (exponente) si no se permiten negativos. El input es
        // controlado: sin onChange el valor no cambia.
        if (!allowNegative && (value.includes("-") || value.toLowerCase().includes("e"))) {
          return;
        }
        // Strippea ceros a la izquierda ("02" -> "2"); conserva "0" y "0.x".
        const cleaned = value.replace(/^0+(?=\d)/, "");
        if (cleaned !== value) e.target.value = cleaned;
      }
      onChange?.(e);
    }

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium">
            {label}
          </label>
        )}

        <div
          className={cn(
            inputWrapperVariants({ variant, inputSize, state }),
            wrapperClassName,
            disabled && "pointer-events-none opacity-40"
          )}
        >
          {leftIcon && <span className="pl-3.5 text-text-subdued">{leftIcon}</span>}

          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            onChange={handleChange}
            className={cn(
              "flex-1 min-w-0 bg-transparent px-3.5 text-text-primary outline-none border-none placeholder:text-text-subdued",
              leftIcon && "pl-2",
              hasRightElement && "pr-2",
              className
            )}
            {...props}
          />

          {hasRightElement && (
            <span className="flex shrink-0 items-center gap-1.5 pr-3.5">
              {state === "loading" && (
                <Loader2 size={16} className="animate-spin text-text-subdued" aria-hidden />
              )}
              {state === "error" && (
                <CircleX size={16} className="text-brand-200" aria-hidden />
              )}
              {rightElement}
            </span>
          )}
        </div>

        {hint && (
          <p
            className={cn(
              "text-xs",
              state === "error" ? "text-brand-200" : "text-text-subdued"
            )}
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";