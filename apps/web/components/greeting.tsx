"use client";

import * as React from "react";

import { greetingForHour } from "@/lib/utils/format";

interface GreetingProps {
  /** Saludo calculado en el server (primer render = SSR, sin mismatch). */
  initial: string;
  name: string;
}

/**
 * Saludo por hora del BROWSER: el RSC calcula la hora del server (UTC en
 * prod), así que tras montar se recalcula. El `initial` evita el hydration
 * mismatch y el rAF evita el setState síncrono dentro del effect.
 */
export function Greeting({ initial, name }: GreetingProps) {
  const [greeting, setGreeting] = React.useState(initial);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setGreeting(greetingForHour(new Date().getHours()));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      {greeting}, {name}
    </>
  );
}
