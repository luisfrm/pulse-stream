import type { MetadataRoute } from "next";

// Manifest dinámico — en Fase 4 (PWA) se varían íconos/nombre por entorno.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulse Stream",
    short_name: "Pulse Stream",
    description: "Tu música, en streaming.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1a16",
    theme_color: "#0e1a16",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
