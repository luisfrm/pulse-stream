"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "group toast w-full rounded-2xl border border-bg-highlight bg-bg-elevated text-text-primary shadow-xl shadow-black/40",
          title: "text-sm font-semibold text-text-primary",
          description: "text-sm text-text-subdued",
          error: "border-brand-900 bg-bg-elevated",
          success: "border-brand-900/60 bg-bg-elevated",
          closeButton:
            "border-bg-highlight bg-bg-base text-text-subdued hover:bg-bg-highlight hover:text-text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };