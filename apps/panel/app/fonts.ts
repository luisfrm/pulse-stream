import { Bricolage_Grotesque, Inter } from "next/font/google";

/**
 * `next/font` se resuelve por app (no desde `packages/design`): es la opción
 * conservadora que garantiza que Next descargue y self-hostee las fuentes en
 * el build de cada app. Los tokens de `packages/design` consumen las variables
 * `--font-display` / `--font-sans`.
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
