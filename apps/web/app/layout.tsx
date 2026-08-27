import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

import { PwaRegister } from "@/components/pwa-register";
import { PlayerBar } from "@/components/player/player-bar";
import { PlayerProvider } from "@/components/player/player-provider";
import { Toaster } from "@/components/ui/sonner";

import { bricolage, inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pulse Stream",
    template: "%s · Pulse Stream",
  },
  description: "Tu música, en streaming.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${bricolage.variable} ${inter.variable} h-full antialiased`}>
      <head>
        {/* Preconnect al bucket público de R2 para covers — reduce DNS/TLS del LCP */}
        <link rel="preconnect" href="https://pulsestreambucket.luisrivas.site" />
        <link rel="dns-prefetch" href="https://pulsestreambucket.luisrivas.site" />
      </head>
      <body className="flex min-h-full flex-col bg-bg-base text-text-primary">
        <PwaRegister />
        <PlayerProvider>
          {children}
          <PlayerBar />
        </PlayerProvider>
        <Toaster />
        {process.env.NODE_ENV === "production" ? <Analytics /> : null}
      </body>
    </html>
  );
}
