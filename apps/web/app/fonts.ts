import { Bricolage_Grotesque, Inter } from "next/font/google";

/**
 * `next/font` se resuelve por app (también hay copia en `apps/panel`): es la
 * opción conservadora para que Next self-hostee las fuentes en cada build. Los
 * tokens de `packages/design` consumen `--font-display` / `--font-sans`.
 */
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  display: "swap",
  variable: "--font-display",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});
