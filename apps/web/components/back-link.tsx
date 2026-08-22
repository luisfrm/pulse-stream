"use client";

import * as React from "react";
import Link from "next/link";

interface BackLinkProps {
  /** Hacia dónde navegar si no hay historial del mismo origen. */
  href: string;
  /** Texto del link (default: "Volver"). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Link con estilo hyperlink para volver a la pantalla anterior.
 * Si hay historial en la sesión actual del browser, hace history.back (soft,
 * sin recargar). Si no (deep link / primera pestaña), navega al fallback `href`.
 */
export function BackLink({ href, children = "Volver", className }: BackLinkProps) {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      event.currentTarget.getAttribute("href")?.startsWith("/")
    ) {
      const referrerIsSameOrigin =
        document.referrer && new URL(document.referrer).origin === window.location.origin;
      if (referrerIsSameOrigin) {
        event.preventDefault();
        window.history.back();
      }
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={
        className ??
        "text-sm text-text-subdued transition-colors hover:text-text-primary"
      }
    >
      &larr; {children}
    </Link>
  );
}
