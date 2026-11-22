import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Song } from "@/lib/services/types";

import { SongItem } from "./song-item";

// El PlayButton usa el reproductor global.
vi.mock("./player/player-provider", () => ({
  usePlayer: () => ({
    current: null,
    playing: false,
    play: vi.fn(),
    toggle: vi.fn(),
  }),
}));

// BrandLogo (NoCover) usa next/image; en jsdom se reemplaza por un <img>.
vi.mock("next/image", () => ({
  default: ({
    priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ""} />;
  },
}));

const song = {
  id: "s1",
  title: "Pompeii",
  artist: { id: "a1", name: "Bastille" },
} as Song;

describe("SongItem", () => {
  it("sin cover renderiza NoCover y el play queda después del slot", () => {
    const { container } = render(
      <SongItem song={{ ...song, cover_url: null }} />
    );

    const noCover = container.querySelector('[data-slot="no-cover"]');
    expect(noCover).not.toBeNull();

    const coverLink = noCover!.closest("a");
    const play = screen.getByRole("button", { name: "Reproducir" });
    expect(coverLink).not.toBeNull();
    expect(coverLink!.nextElementSibling).toBe(play);
  });

  it("con cover renderiza la imagen y no el placeholder", () => {
    const { container } = render(
      <SongItem
        song={{
          ...song,
          cover_url: "https://cdn.example.test/cover.webp",
        }}
      />
    );

    expect(container.querySelector('[data-slot="no-cover"]')).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });
});
