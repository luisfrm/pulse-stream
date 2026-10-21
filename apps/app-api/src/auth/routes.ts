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
