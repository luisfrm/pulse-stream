/**
 * Helpers de fechas compartidos por los services.
 *
 * Viven acá (y no duplicados en cada service) porque las ventanas de tiempo
 * tienen que ser idénticas entre endpoints: `GET /songs/popular?month=true` y
 * el snapshot `top_month` de las playlists del sistema cortan en el mismo
 * instante (día 1 a las 00:00 UTC).
 */

/**
 * Inicio del mes calendario actual en **UTC**.
 *
 * La zona horaria nunca sale del cliente: el corte se calcula en UTC igual que
 * el backend Python (`datetime.now(timezone.utc).replace(day=1, ...)`).
 */
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
