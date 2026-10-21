import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const titleVariants = cva("font-display font-bold tracking-tight leading-tight", {
  variants: {
    size: {
      hero: "text-4xl sm:text-6xl font-extrabold tracking-tighter",
      section: "text-2xl sm:text-3xl font-bold",
      card: "text-lg sm:text-xl font-bold",
      sm: "text-base font-semibold",
    },
    accent: {
      none: "text-text-primary",
      primary: "text-brand-400",
      muted: "text-text-subdued",
    },
  },
  defaultVariants: {
    size: "section",
    accent: "none",
  },
});

type TitleTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "span" | "div";

export interface TitleProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof titleVariants> {
  as?: TitleTag;
}

export const Title = React.forwardRef<HTMLElement, TitleProps>(
  ({ as: Tag = "h2", size, accent, className, children, ...props }, ref) => {
    return React.createElement(
      Tag,
      {
        ref,
        className: cn(titleVariants({ size, accent }), className),
        ...props,
      },
      children
    );
  }
);
Title.displayName = "Title";

export { titleVariants };
