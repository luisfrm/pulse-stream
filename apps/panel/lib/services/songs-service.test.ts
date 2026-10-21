import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  panelApi: vi.fn(),
}));

import { panelApi } from "@/lib/api/client";
import { songsService } from "./songs-service";

describe("panel songsService (admin)", () => {
  beforeEach(() => {
    vi.mocked(panelApi).mockReset();
  });

  it("crea una canción con POST /songs y el payload completo", async () => {
    vi.mocked(panelApi).mockResolvedValue({ id: "s1" });

    await songsService.createSong({
      title: "Crimen",
      artist_id: "ar1",
      album_id: "al1",
      genres: ["rock"],
      object_key: "audio/s1.mp3",
    });

    expect(panelApi).toHaveBeenCalledWith("/songs", {
      method: "POST",
      body: expect.objectContaining({
        title: "Crimen",
        album_id: "al1",
        object_key: "audio/s1.mp3",
      }),
    });
  });

  it("actualiza una canción con PATCH /songs/{id}", async () => {
    vi.mocked(panelApi).mockResolvedValue({ id: "s1" });

    await songsService.updateSong("s1", {
      title: "Crimen (Remaster)",
      genres: ["rock", "pop"],
    });

    expect(panelApi).toHaveBeenCalledWith("/songs/s1", {
      method: "PATCH",
      body: { title: "Crimen (Remaster)", genres: ["rock", "pop"] },
    });
  });

  it("borra una canción con DELETE /songs/{id}", async () => {
    vi.mocked(panelApi).mockResolvedValue(undefined);

    await songsService.deleteSong("s1");

    expect(panelApi).toHaveBeenCalledWith("/songs/s1", { method: "DELETE" });
  });

  it("lista canciones mapeando query/artistId/albumId a los nombres de la API", async () => {
    vi.mocked(panelApi).mockResolvedValue({ items: [], total: 0, offset: 0, limit: 9 });

    await songsService.getSongs({
      query: "crimen",
      artistId: "ar1",
      albumId: "al1",
      offset: 9,
      limit: 9,
    });

    expect(panelApi).toHaveBeenCalledWith(
      "/songs",
      expect.objectContaining({
        query: { offset: 9, limit: 9, q: "crimen", artist_id: "ar1", album_id: "al1" },
      })
    );
  });
});
