/**
 * Dependencias inyectables de la app.
 *
 * `createApp(deps)` permite que los tests reemplacen el storage (R2 real nunca
 * se toca en la suite). En producción `deps` va vacío y cada request construye
 * su `R2Storage` desde el `AppConfig` del entorno.
 */

import type { AppConfig } from "@/env";
import { createR2Storage, type R2Storage } from "@/storage/r2";

export interface AppDeps {
  /** Storage inyectado (tests). Si falta, se arma uno por request. */
  readonly storage?: R2Storage;
}

/** Storage efectivo del request: el inyectado o el de la config del entorno. */
export function storageFor(deps: AppDeps, config: AppConfig): R2Storage {
  return deps.storage ?? createR2Storage(config);
}
