import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { clearSessionCookie, setSessionCookie } from "./cookies";
import { signSession } from "./session";
import { verifyPassword } from "./password";
import { BadRequestError, ErrorSchema } from "../lib/errors";
import type { AppBindings } from "../types";

const loginBodySchema = z
  .object({
    identifier: z.string().min(1).max(320),
    password: z.string().min(1).max(1024),
  })
  .openapi("LoginRequest");

const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  tags: ["auth"],
  summary: "Login con email/usuario y contraseña",
  description:
    "Acepta email o username (case-insensitive) + password argon2id (hash de pwdlib) y setea la cookie `session`. No hay registro público: las cuentas de la app son filas existentes en `users` (el alta nueva llega con Better Auth). Requiere Workers Paid en producción (argon2 > 10 ms CPU).",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: loginBodySchema } },
    },
  },
  responses: {
    204: { description: "Sesión iniciada" },
    400: {
      description: "Credenciales inválidas",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/auth/logout",
  tags: ["auth"],
  summary: "Cierra la sesión",
  description: "Expira la cookie `session` (Max-Age=0).",
  responses: {
    204: { description: "Sesión cerrada" },
  },
});

export function createAuthRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(loginRoute, async (c) => {
    const { identifier, password } = c.req.valid("json");
    const user = await c.get("users").findByIdentifier(identifier);

    // Mismo criterio que Python: un usuario sin hash o inactivo no puede
    // autenticarse; nunca se filtra cuál de las condiciones falló.
    if (!user || !user.is_active || !user.hashed_password) {
      throw new BadRequestError("Credenciales inválidas");
    }

    const valid = await verifyPassword(password, user.hashed_password);
    if (!valid) {
      throw new BadRequestError("Credenciales inválidas");
    }

    const session = await signSession(user.id, c.get("config").authSecret);
    setSessionCookie(c, session, c.get("config"));

    return c.body(null, 204);
  });

  app.openapi(logoutRoute, (c) => {
    clearSessionCookie(c, c.get("config"));
    return c.body(null, 204);
  });

  return app;
}
