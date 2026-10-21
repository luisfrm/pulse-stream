/**
 * Respuesta paginada del backend (offset/limit).
 *
 * Vive en `@pulse-stream/shared` para que la app y el panel usen el mismo
 * contrato sin duplicar tipos a mano (los items siguen saliendo de
 * `@pulse-stream/api-types` / `@pulse-stream/app-api-types`).
 */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
