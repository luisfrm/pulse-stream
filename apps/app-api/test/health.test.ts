import { describe, expect, it } from "vitest";

import { buildTestApp } from "./helpers";

describe("GET /health", () => {
  it("responde 200 {status:'ok'}", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("expone el OpenAPI 3.1 con las rutas publicadas", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/openapi.json");
    expect(response.status).toBe(200);

    const document = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components?: { securitySchemes?: Record<string, unknown> };
    };

    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths).sort()).toEqual([
      "/albums",
      "/albums/{album_id}",
      "/artists",
      "/artists/{artist_id}",
      "/auth/google",
      "/auth/google/callback",
      "/auth/login",
      "/auth/logout",
      "/genres",
      "/health",
      "/me/favorites",
      "/me/favorites/albums",
      "/me/favorites/albums/ids",
      "/me/favorites/albums/{album_id}",
      "/me/favorites/ids",
      "/me/favorites/playlists",
      "/me/favorites/playlists/ids",
      "/me/favorites/playlists/{playlist_id}",
      "/me/favorites/{song_id}",
      "/me/library/ids",
      "/me/listens",
      "/me/playlists",
      "/me/playlists/page",
      "/me/recently-played",
      "/playlists",
      "/playlists/public",
      "/playlists/{playlist_id}",
      "/playlists/{playlist_id}/songs",
      "/playlists/{playlist_id}/songs/{song_id}",
      "/songs",
      "/songs/popular",
      "/songs/{song_id}",
      "/uploads/presign-cover",
      "/users/me",
    ]);
    expect(document.components?.securitySchemes).toHaveProperty(
      "sessionCookie",
    );
  });

  it("devuelve 404 {detail} en rutas desconocidas", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/nope");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ detail: "Not Found" });
  });
});
