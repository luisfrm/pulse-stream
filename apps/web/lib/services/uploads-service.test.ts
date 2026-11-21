import { describe, expect, it, vi } from "vitest";

// `uploadToR2` pega DIRECTO a R2 con `ofetch` (sin la instancia `api`, que
// enviaría cookies y baseURL interna): se mockea para inspeccionar el PUT.
// `api` también se mockea para no construir el cliente HTTP (usa next/headers).
vi.mock("ofetch", () => ({
  ofetch: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({
  api: vi.fn(),
}));

import { ofetch } from "ofetch";

import { uploadContentType, uploadToR2 } from "./uploads-service";

/** `File` de jsdom: el contenido no importa, solo nombre y `type`. */
function file(name: string, type = ""): File {
  return new File([], name, { type });
}

// Invariante del presign: el Content-Type que se firma (por extensión) y el
// que viaja en el PUT a R2 DEBEN ser el mismo o R2 rechaza la firma.
describe("uploadContentType", () => {
  it("usa la extensión del audio, no el type que reporta el OS", () => {
    expect(uploadContentType(file("tema.m4a", "audio/x-m4a"))).toBe(
      "audio/mp4",
    );
    expect(uploadContentType(file("tema.aac", "audio/vnd.dlna.adts"))).toBe(
      "audio/aac",
    );
    expect(uploadContentType(file("tema.mp3", "audio/mp3"))).toBe("audio/mpeg");
  });

  it("compara la extensión sin distinguir mayúsculas", () => {
    expect(uploadContentType(file("TEM.M4A", "audio/mp4"))).toBe("audio/mp4");
  });

  it("sin extensión de audio conocida cae al type del navegador", () => {
    // Covers WebP pasan por la misma función (el type sí es el correcto).
    expect(uploadContentType(file("portada", "image/webp"))).toBe("image/webp");
  });

  it("sin extensión conocida y sin type: audio/mpeg", () => {
    expect(uploadContentType(file("tema"))).toBe("audio/mpeg");
  });
});

describe("uploadToR2", () => {
  it("el PUT manda el MISMO Content-Type que se firmó", async () => {
    const audio = file("tema.m4a", "audio/x-m4a");

    await uploadToR2("https://r2.test/presigned", audio);

    expect(ofetch).toHaveBeenCalledWith(
      "https://r2.test/presigned",
      expect.objectContaining({
        method: "PUT",
        body: audio,
        retry: 0,
        // `audio/mp4` (extensión), NO el `audio/x-m4a` del OS.
        headers: expect.objectContaining({ "Content-Type": "audio/mp4" }),
      }),
    );
  });

  it("el PUT de un cover reenvía también el Cache-Control firmado", async () => {
    const cover = file("cover.webp", "image/webp");

    await uploadToR2("https://r2.test/cover", cover, "public, max-age=60");

    expect(ofetch).toHaveBeenCalledWith(
      "https://r2.test/cover",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=60",
        }),
      }),
    );
  });
});
