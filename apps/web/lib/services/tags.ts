/**
 * Tags de caché de Next.js para revalidación granular (updateTag).
 * El catálogo (artistas/canciones/géneros) es público y compartido:
 * se cachea con estos tags y se purga en cada mutación.
 */
export const CACHE_TAGS = {
  artists: "catalog:artists",
  songs: "catalog:songs",
  genres: "catalog:genres",
} as const;
