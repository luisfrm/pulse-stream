import { describe, expect, it } from "vitest";

import { isAlbumReturnPath, safePanelReturnPath } from "./song-upload";

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
