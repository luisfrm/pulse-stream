import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-pill border border-transparent transition-colors",
  {
    variants: {
      variant: {
        default: "bg-brand-400/10 text-brand-200 border-brand-400/20",
        success: "bg-brand-400/10 text-brand-200 border-brand-400/20",
        warning: "bg-brand-900/50 text-brand-200 border-brand-900",
        danger: "bg-brand-900/50 text-brand-200 border-brand-900",
        glass: "bg-bg-highlight/40 text-text-subdued border-bg-highlight",
      },
      size: {
        sm: "h-5 px-2 text-[10px]",
        md: "h-6 px-2.5 text-xs",
        lg: "h-7 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export function Badge({ className, variant, size, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
