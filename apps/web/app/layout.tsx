import type { Metadata } from "next";

import { PlayerBar } from "@/components/player/player-bar";
import { PlayerProvider } from "@/components/player/player-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pulse Stream",
    template: "%s · Pulse Stream",
  },
  description: "Tu música, en streaming.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-bg-base text-text-primary">
        <PlayerProvider>
          {children}
          <PlayerBar />
        </PlayerProvider>
      </body>
    </html>
  );
}
