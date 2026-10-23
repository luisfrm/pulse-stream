/**
 * Catálogo de géneros permitidos (espejo de `features/genres/router.py`).
 *
 * El orden es el de declaración del enum (el mismo que expone Python), así el
 * web pinta los filtros en el mismo orden.
 */

import { SongGenreEnum } from "@/schemas";

export function listGenres(): string[] {
  return [...SongGenreEnum.options];
}
