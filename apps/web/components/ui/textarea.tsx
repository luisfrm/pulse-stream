import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const textareaVariants = cva(
  "w-full rounded-xl border bg-bg-elevated px-3.5 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-subdued",
  {
    variants: {
      variant: {
        default:
          "border-bg-highlight hover:bg-bg-highlight/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400",
        glass: "border-bg-highlight bg-bg-highlight/40 hover:bg-bg-highlight/60 focus:border-brand-400",
      },
      state: {
        default: "",
        error: "border-brand-900 focus:border-brand-900 focus:ring-brand-900",
      },
    },
    defaultVariants: {
      variant: "default",
      state: "default",
    },
  }
);

export interface TextareaProps
  extends React.ComponentProps<"textarea">,
    VariantProps<typeof textareaVariants> {
  label?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, state, label, hint, id, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(textareaVariants({ variant, state }), className)}
          {...props}
        />
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
Textarea.displayName = "Textarea";
