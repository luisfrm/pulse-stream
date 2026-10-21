import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Fusiona clases condicionales sin colisiones CSS (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
