import { describe, expect, it } from "vitest";

import {
  getPanelReturnLabel,
  isAlbumReturnPath,
  isArtistReturnPath,
  safePanelReturnPath,
} from "./song-upload";

describe("safePanelReturnPath", () => {
  it("accepts internal panel paths", () => {
    expect(safePanelReturnPath("/panel/albums/alb-1")).toBe("/panel/albums/alb-1");
    expect(safePanelReturnPath("/panel/songs?page=2")).toBe("/panel/songs?page=2");
  });

  it("falls back when path is missing or outside /panel/", () => {
    expect(safePanelReturnPath(undefined)).toBe("/panel/songs");
    expect(safePanelReturnPath("")).toBe("/panel/songs");
    expect(safePanelReturnPath("https://evil.example/panel/albums/1")).toBe("/panel/songs");
    expect(safePanelReturnPath("//evil.example/panel/albums/1")).toBe("/panel/songs");
    expect(safePanelReturnPath("/dashboard")).toBe("/panel/songs");
    expect(safePanelReturnPath("/panel\\albums\\1")).toBe("/panel/songs");
  });
});

describe("isAlbumReturnPath", () => {
  it("detects album detail return paths", () => {
    expect(isAlbumReturnPath("/panel/albums/alb-1")).toBe(true);
    expect(isAlbumReturnPath("/panel/songs")).toBe(false);
  });
});

describe("isArtistReturnPath", () => {
  it("detects artist detail return paths", () => {
    expect(isArtistReturnPath("/panel/artists/art-1")).toBe(true);
    expect(isArtistReturnPath("/panel/artists")).toBe(false);
    expect(isArtistReturnPath("/panel/albums/alb-1")).toBe(false);
    expect(isArtistReturnPath("/panel/songs")).toBe(false);
  });
});

describe("getPanelReturnLabel", () => {
  it("returns the matching label for album, artist, and default paths", () => {
    expect(getPanelReturnLabel("/panel/albums/alb-1")).toBe("← Volver al álbum");
    expect(getPanelReturnLabel("/panel/artists/art-1")).toBe("← Volver al artista");
    expect(getPanelReturnLabel("/panel/songs")).toBe("← Volver a canciones");
    expect(getPanelReturnLabel("/panel/artists")).toBe("← Volver a canciones");
  });
});
