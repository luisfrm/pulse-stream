"use client";

import { useEffect, useState } from "react";

/**
 * `true` cuando el viewport es menor a 768px (md). Basado en matchMedia:
 * SSR-safe (arranca en desktop y se corrige tras el mount, sin mismatch de
 * hidratación) y sin re-renders por resize.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}