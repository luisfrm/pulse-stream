/**
 * Utilidades puras compartidas por `apps/web` y `apps/panel`.
 *
 * Sin React, sin Next y sin estado global: helpers de formato, errores
 * amigables, tags de caché, paginación y el orquestador de audio (TS puro;
 * cada app tiene su propia instancia del módulo).
 */
export * from "./format";
export * from "./error";
export * from "./tags";
export * from "./pagination";
export * from "./audio-orchestrator";
