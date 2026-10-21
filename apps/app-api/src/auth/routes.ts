import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import {
  clearOAuthStateCookie,
  clearSessionCookie,
  getOAuthStateCookie,
  setOAuthStateCookie,
  setSessionCookie,
} from "./cookies";
import {
  createCodeChallenge,
  createCodeVerifier,
  createState,
  signOAuthState,
  timingSafeEqual,
  verifyOAuthState,
} from "./google";
import { signSession } from "./session";
import { verifyPassword } from "./password";
import {
  BadRequestError,
  ErrorSchema,
} from "../lib/errors";
import { absoluteAppRedirect, safeReturnTo } from "../lib/redirect";
import type { AppBindings } from "../types";
import { resolveGoogleUser } from "../features/users/service";

const startQuerySchema = z.object({
  returnTo: z
    .string()
    .optional()
    .openapi({
      param: { name: "returnTo", in: "query" },
      example: "/dashboard",
      description:
        "Path interno del frontend al que volver tras el login (default `/dashboard`).",
    }),
});

const callbackQuerySchema = z.object({
  code: z
    .string()
    .optional()
    .openapi({ param: { name: "code", in: "query" } }),
  state: z
    .string()
    .optional()
    .openapi({ param: { name: "state", in: "query" } }),
});

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
    "Acepta email o username (case-insensitive) + password argon2id (hash de pwdlib). Setea la cookie `session` igual que Google. Los usuarios OAuth-only no tienen password. Requiere Workers Paid en producción (argon2 > 10 ms CPU).",
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

const googleStartRoute = createRoute({
  method: "get",
  path: "/auth/google",
  tags: ["auth"],
  summary: "Inicia el login con Google",
  description:
    "Genera state + PKCE S256, firma la cookie `oauth_state` (10 min) y redirige a Google.",
  request: { query: startQuerySchema },
  responses: {
    302: { description: "Redirect a accounts.google.com" },
    503: {
      description: "Google OAuth sin configurar",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const googleCallbackRoute = createRoute({
  method: "get",
  path: "/auth/google/callback",
  tags: ["auth"],
  summary: "Callback de Google",
  description:
    "Valida state/PKCE, intercambia el code, verifica el id_token, resuelve el usuario y setea la cookie `session`.",
  request: { query: callbackQuerySchema },
  responses: {
    302: { description: "Redirect a APP_URL + returnTo" },
    400: {
      description: "State/code inválido",
      content: { "application/json": { schema: ErrorSchema } },
    },
    502: {
      description: "Fallo del token endpoint de Google",
      content: { "application/json": { schema: ErrorSchema } },
    },
    503: {
      description: "Google OAuth sin configurar",
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

    // Mismo criterio que Python: un usuario sin hash (solo Google) o inactivo
    // no puede autenticarse; nunca se filtra cuál de las condiciones falló.
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

  app.openapi(googleStartRoute, async (c) => {
    const config = c.get("config");
    const google = c.get("google");

    const returnTo = safeReturnTo(c.req.valid("query").returnTo);
    const state = createState();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = await createCodeChallenge(codeVerifier);

    const signedState = await signOAuthState(
      { state, codeVerifier, returnTo },
      config.authSecret,
    );
    // Primero validar config/URL de Google: si falta un secret, no se emite
    // una cookie `oauth_state` huérfana.
    const authUrl = google.buildAuthUrl({ state, codeChallenge });
    setOAuthStateCookie(c, signedState, config);

    return c.redirect(authUrl, 302);
  });

  app.openapi(googleCallbackRoute, async (c) => {
    const config = c.get("config");
    const google = c.get("google");
    const users = c.get("users");
    const { code, state } = c.req.valid("query");

    const stateCookie = getOAuthStateCookie(c);
    if (stateCookie) clearOAuthStateCookie(c, config);

    if (!code || !state) {
      throw new BadRequestError("Missing code or state");
    }
    if (!stateCookie) {
      throw new BadRequestError("Invalid OAuth state");
    }

    let oauthState;
    try {
      oauthState = await verifyOAuthState(stateCookie, config.authSecret);
    } catch {
      throw new BadRequestError("Invalid OAuth state");
    }

    if (!timingSafeEqual(oauthState.state, state)) {
      throw new BadRequestError("Invalid OAuth state");
    }

    const { idToken } = await google.exchangeCode({
      code,
      codeVerifier: oauthState.codeVerifier,
    });
    const identity = await google.verifyIdToken(idToken);
    const user = await resolveGoogleUser(identity, users);

    const session = await signSession(user.id, config.authSecret);
    setSessionCookie(c, session, config);

    return c.redirect(
      absoluteAppRedirect(config.appUrl, oauthState.returnTo),
      302,
    );
  });

  app.openapi(logoutRoute, (c) => {
    clearSessionCookie(c, c.get("config"));
    return c.body(null, 204);
  });

  return app;
}
