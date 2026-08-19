import { redirect } from "next/navigation";

export const metadata = { title: "Playlist" };

/**
 * Fase 5.5: el detalle de playlist vive en `/playlists/[id]` (top-level).
 * Esta ruta queda como redirect para no romper links viejos.
 */
export default async function PlaylistDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/playlists/${id}`);
}