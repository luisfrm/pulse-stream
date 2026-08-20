import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  api: vi.fn(),
}));

import { api } from "@/lib/api/client";
import { playlistsService } from "./playlists-service";

// Regresión: el picker necesita `song_ids` (MyPlaylistRead). El servicio debe
// pegar a GET /me/playlists — /playlists devuelve PlaylistRead sin song_ids y
// el toggle del picker se rompe en silencio (siempre agrega).
describe("playlistsService", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it("getMyPlaylists consulta GET /me/playlists (con song_ids)", async () => {
    vi.mocked(api).mockResolvedValue([]);

    await playlistsService.getMyPlaylists();

    expect(api).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api).mock.calls[0][0]).toBe("/me/playlists");
  });

  it("getMyPlaylists NO consulta /playlists (sin song_ids)", async () => {
    vi.mocked(api).mockResolvedValue([]);

    await playlistsService.getMyPlaylists();

    expect(api).not.toHaveBeenCalledWith("/playlists", expect.anything());
  });
});