import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Song } from "@/lib/services/types";

import { SongItem } from "./song-item";

// El PlayButton usa el reproductor global. `vi.hoisted` deja los spies
// estables y accesibles desde los tests (el factory de `vi.mock` se eleva).
const player = vi.hoisted(() => ({
  current: null as { id: string } | null,
  playing: false,
  play: vi.fn(),
  toggle: vi.fn(),
}));

vi.mock("./player/player-provider", () => ({
  usePlayer: () => player,
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

beforeEach(() => {
  player.current = null;
  player.playing = false;
  player.play.mockClear();
  player.toggle.mockClear();
});

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

  it("por defecto el título es un link al detalle", () => {
    render(<SongItem song={song} />);

    expect(screen.getByRole("link", { name: "Pompeii" })).toHaveAttribute(
      "href",
      "/song/s1"
    );
    expect(
      screen.getByRole("link", { name: "Bastille" })
    ).toHaveAttribute("href", "/artist/a1");
  });

  it("con playOnClick no hay links y tocar el área reproduce con el contexto", () => {
    const context = { label: "Playlist: Mix", seed: [song] };
    const { container } = render(
      <SongItem song={song} playOnClick context={context} />
    );

    // Cover y textos dejan de navegar: la fila es solo reproducción.
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Pompeii")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Reproducir Pompeii" })
    );
    expect(player.play).toHaveBeenCalledWith(song, context);
    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("con playOnClick y la canción sonando, tocar el área pausa", () => {
    player.current = song;
    player.playing = true;
    render(<SongItem song={song} playOnClick />);

    fireEvent.click(screen.getByRole("button", { name: "Pausar Pompeii" }));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });
});
