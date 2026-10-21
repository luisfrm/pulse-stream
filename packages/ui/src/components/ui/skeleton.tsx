import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const skeletonVariants = cva("animate-pulse", {
  variants: {
    variant: {
      default: "bg-bg-highlight",
      elevated: "bg-bg-elevated",
      brand: "bg-brand-900/60",
    },
    shape: {
      rect: "rounded-xl",
      circle: "rounded-full",
      pill: "rounded-pill",
    },
  },
  defaultVariants: { variant: "default", shape: "rect" },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

export function Skeleton({ className, variant, shape, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(skeletonVariants({ variant, shape }), className)}
      {...props}
    />
  );
}