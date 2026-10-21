import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  panelApi: vi.fn(),
}));

import { panelApi } from "@/lib/api/client";
import { albumsService } from "./albums-service";

describe("panel albumsService (admin)", () => {
  beforeEach(() => {
    vi.mocked(panelApi).mockReset();
  });

  it("crea un álbum con POST /albums", async () => {
    vi.mocked(panelApi).mockResolvedValue({ id: "al1" });

    await albumsService.create({
      title: "Bocanada",
      artist_id: "ar1",
      cover_key: "covers/c1.webp",
    });

    expect(panelApi).toHaveBeenCalledWith("/albums", {
      method: "POST",
      body: {
        title: "Bocanada",
        artist_id: "ar1",
        cover_key: "covers/c1.webp",
      },
    });
  });

  it("actualiza un álbum con PATCH /albums/{id}", async () => {
    vi.mocked(panelApi).mockResolvedValue({ id: "al1" });

    await albumsService.update("al1", { title: "Bocanada (Deluxe)" });

    expect(panelApi).toHaveBeenCalledWith("/albums/al1", {
      method: "PATCH",
      body: { title: "Bocanada (Deluxe)" },
    });
  });

  it("borra un álbum con DELETE /albums/{id}", async () => {
    vi.mocked(panelApi).mockResolvedValue(undefined);

    await albumsService.delete("al1");

    expect(panelApi).toHaveBeenCalledWith("/albums/al1", { method: "DELETE" });
  });

  it("importa un ZIP como multipart a /albums/{id}/import-zip", async () => {
    const result = { imported: [], skipped: [], failed: [] };
    vi.mocked(panelApi).mockResolvedValue(result);
    const file = new File(["zip"], "album.zip", { type: "application/zip" });

    const response = await albumsService.importZip("al1", file);

    expect(response).toEqual(result);
    const [path, options] = vi.mocked(panelApi).mock.calls[0] as [
      string,
      { method: string; body: FormData; timeout: number },
    ];
    expect(path).toBe("/albums/al1/import-zip");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("file")).toBe(file);
    // Un ZIP grande puede tardar: timeout extendido.
    expect(options.timeout).toBe(300_000);
  });
});
