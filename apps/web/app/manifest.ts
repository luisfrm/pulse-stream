import type { MetadataRoute } from "next";

const APP_NAME = "Pulse Stream";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Pulse Stream",
    description: "Tu música, en streaming. Descubrí canciones y playlists.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1a16",
    theme_color: "#0e1a16",
    categories: ["music", "entertainment", "lifestyle"],
    lang: "es",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Buscar canciones",
        short_name: "Buscar",
        url: "/search",
      },
      {
        name: "Mi catálogo",
        short_name: "Catálogo",
        url: "/catalog",
      },
      {
        name: "Playlists",
        short_name: "Playlists",
        url: "/playlists",
      },
    ],
  };
}