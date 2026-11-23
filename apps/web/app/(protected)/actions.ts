import { updateTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/services/tags";

/**
 * Server Action compartida por las páginas del área protegida que renderizan
 * canciones con acciones de usuario (♥, "+" playlist).
 *
 * Un like o una playlist mutada no purga un `revalidate` fijo: `favorites` y
 * `playlists` son datos POR USUARIO y se invalidan con `updateTag`. Sin esto,
 * `/catalog`, `/me/playlists` o el feed que dependa de esos tags queda con el
 * estado viejo hasta su `revalidate` (hasta 300 s en las secciones cacheadas).
 *
 * Única copia: la consumen `/songs`, `/search` (resultados y landing),
 * `/catalog`, `/catalog/songs` y `/artist/[id]` como `onMutated`.
 */
export async function refreshLibrary(): Promise<void> {
  "use server";

  updateTag(CACHE_TAGS.favorites);
  updateTag(CACHE_TAGS.playlists);
}
