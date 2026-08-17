import type { Metadata } from "next";

import { PwaRegister } from "@/components/pwa-register";
import { PlayerBar } from "@/components/player/player-bar";
import { PlayerProvider } from "@/components/player/player-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pulse Stream",
    template: "%s · Pulse Stream",
  },
  description: "Tu música, en streaming.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-bg-base text-text-primary">
        <PwaRegister />
        <PlayerProvider>
          {children}
          <PlayerBar />
        </PlayerProvider>
      </body>
    </html>
  );
}
