import { redirect } from "next/navigation";

export const metadata = { title: "Playlists" };

/**
 * Fase 5.5: las playlists viven en `/playlists` (top-level). Esta ruta queda
 * como redirect para no romper links viejos.
 */
export default function PlaylistsRedirect() {
  redirect("/playlists");
}