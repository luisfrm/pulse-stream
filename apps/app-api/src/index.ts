import { createApp } from "./app";
import { parseConfig } from "./config";
import { createRequestRepositories } from "./db/client";
import type { Env } from "./env";

/**
 * Wiring de producción.
 *
 * `createApp` se construye por request porque `parseConfig(env)` necesita los
 * bindings/secrets del runtime. El driver de DB es Neon HTTP en local y en
 * producción; la primera query abre el request HTTP a Neon.
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
