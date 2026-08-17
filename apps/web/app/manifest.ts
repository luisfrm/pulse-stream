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
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Buscar canciones",
        short_name: "Buscar",
        url: "/dashboard/search",
      },
      {
        name: "Tus favoritos",
        short_name: "Favoritos",
        url: "/dashboard/favorites",
      },
      {
        name: "Playlists",
        short_name: "Playlists",
        url: "/dashboard/playlists",
      },
    ],
  };
}