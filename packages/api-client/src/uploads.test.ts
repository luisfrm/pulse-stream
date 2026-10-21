import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ofetch", () => ({
  ofetch: vi.fn(),
}));

import { ofetch } from "ofetch";

import { COVER_CACHE_CONTROL, uploadToR2 } from "./uploads";

describe("uploadToR2", () => {
  beforeEach(() => {
    vi.mocked(ofetch).mockReset();
    vi.mocked(ofetch).mockResolvedValue(undefined);
  });

  it("envía el header Cache-Control cuando se le pasa (PUT firmado de covers)", async () => {
    const file = new File(["data"], "cover.webp", { type: "image/webp" });

    await uploadToR2("https://presign.example.com/put", file, COVER_CACHE_CONTROL);

    expect(ofetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(ofetch).mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://presign.example.com/put");
    expect(options.method).toBe("PUT");
    expect(options.headers["Content-Type"]).toBe("image/webp");
    expect(options.headers["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("omite Cache-Control cuando no se le pasa (PUT de audio)", async () => {
    const file = new File(["data"], "song.mp3", { type: "audio/mpeg" });

    await uploadToR2("https://presign.example.com/put-audio", file);

    const [, options] = vi.mocked(ofetch).mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(options.headers["Content-Type"]).toBe("audio/mpeg");
    expect(options.headers).not.toHaveProperty("Cache-Control");
  });
});
