import type { Metadata } from "next";

import { bricolage, inter } from "./fonts";
import "./globals.css";

/**
 * Root layout LEAN del panel: fuentes, tokens y metadata. Sin PlayerProvider,
 * sin PlayerBar, sin PWA/SW, sin Analytics y sin Toaster (el panel muestra sus
 * errores inline). Si en el futuro el panel usa toasts, montar `<Toaster />`
 * acá.
 */
export const metadata: Metadata = {
  title: {
    default: "Pulse Stream · Panel",
    template: "%s · Pulse Stream Panel",
  },
  description: "Administración del catálogo de Pulse Stream.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        {/* Preconnect al bucket público de R2 para covers (mismo que la app). */}
        <link rel="preconnect" href="https://pulsestreambucket.luisrivas.site" />
        <link rel="dns-prefetch" href="https://pulsestreambucket.luisrivas.site" />
      </head>
      <body className="flex min-h-full flex-col bg-bg-base text-text-primary">
        {children}
      </body>
    </html>
  );
}
