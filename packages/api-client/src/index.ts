/**
 * Cliente HTTP isomórfico compartido por `apps/web` y `apps/panel`.
 *
 * Cada app crea su instancia con su baseURL y SU cookie de sesión; el paquete
 * no conoce URLs ni nombres de cookie.
 */
export * from "./client";
export * from "./types";
export * from "./uploads";
// friendlyError se usa en todos los componentes que mutan; se re-exporta acá
// para que un consumidor del cliente no tenga que importar dos paquetes.
export { friendlyError, formatApiErrorMessage } from "@pulse-stream/shared";
