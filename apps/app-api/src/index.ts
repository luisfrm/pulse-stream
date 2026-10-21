import { createApp } from "./app";
import { createGoogleClient } from "./auth/google";
import { parseConfig } from "./config";
import { createRequestRepositories } from "./db/client";
import type { Env } from "./env";

/**
 * Wiring de producción.
 *
 * `createApp` se construye por request porque `parseConfig(env)` necesita los
 * bindings/secrets del runtime y el `pg.Client` es por request. El registro de
 * rutas es barato; la conexión a la DB se abre recién en la primera query y
 * `users` + `catalog` comparten esa única conexión.
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const config = parseConfig(env);
      const app = createApp({
        config,
        google: createGoogleClient(config.google),
        repositories: (requestEnv) => createRequestRepositories(requestEnv),
      });

      return await app.fetch(request, env, ctx);
    } catch (error) {
      // Config inválida/missing secrets: no se filtra detalle al cliente.
      console.error("app-api: failed to handle request", error);
      return new Response(JSON.stringify({ detail: "Internal Server Error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
