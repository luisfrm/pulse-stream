import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const inputWrapperVariants = cva(
  "relative flex items-center border rounded-xl transition-colors focus-within:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-bg-elevated border-bg-highlight hover:bg-bg-highlight/50 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400",
        glass: "bg-bg-highlight/40 border-bg-highlight hover:bg-bg-highlight/60 focus-within:border-brand-400",
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
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, variant, inputSize, state, label, hint, leftIcon, rightElement, id, disabled, ...props },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

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
            disabled && "pointer-events-none opacity-40"
          )}
        >
          {leftIcon && <span className="pl-3.5 text-text-subdued">{leftIcon}</span>}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "flex-1 h-full bg-transparent px-3.5 text-text-primary outline-none border-none placeholder:text-text-subdued",
              leftIcon && "pl-2",
              className
            )}
            {...props}
          />

          {rightElement && <span className="pr-3.5">{rightElement}</span>}
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
