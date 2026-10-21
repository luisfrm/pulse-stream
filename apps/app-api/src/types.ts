import type { Env } from "./env";
import type { AppConfig } from "./config";
import type { GoogleClient } from "./auth/google";
import type { CatalogRepository } from "./features/catalog/repository";
import type { CoverPresigner } from "./features/uploads/presign";
import type { UserRepository } from "./features/users/repository";
import type { WritesRepository } from "./features/writes/repository";
import type { Context } from "hono";

/** Variables tipadas que `app.ts` deja disponibles en cada request. */
export interface AppBindings {
  Bindings: Env;
  Variables: {
    config: AppConfig;
    users: UserRepository;
    catalog: CatalogRepository;
    writes: WritesRepository;
    google: GoogleClient;
    /** `null` = R2 sin credenciales (presign-cover responde 503). */
    coverPresigner: CoverPresigner | null;
  };
}

export type AppContext = Context<AppBindings>;
