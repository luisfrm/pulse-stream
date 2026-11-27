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
  it("sin cover renderiza NoCover dentro del área que reproduce y el ▶ al lado", () => {
    const { container } = render(
      <SongItem song={{ ...song, cover_url: null }} />
    );

    const noCover = container.querySelector('[data-slot="no-cover"]');
    expect(noCover).not.toBeNull();

    const area = screen.getByRole("button", { name: "Reproducir Pompeii" });
    const play = screen.getByRole("button", { name: "Reproducir" });
    expect(noCover!.closest("button")).toBe(area);
    expect(area.nextElementSibling).toBe(play);
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

  it("tocar el área reproduce con el contexto y la fila no navega", () => {
    const context = { label: "Playlist: Mix", seed: [song] };
    const { container } = render(<SongItem song={song} context={context} />);

    // Cover y textos no navegan: la fila es solo reproducción.
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Pompeii")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Reproducir Pompeii" })
    );
    expect(player.play).toHaveBeenCalledWith(song, context);
    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("con la canción sonando, tocar el área pausa", () => {
    player.current = song;
    player.playing = true;
    render(<SongItem song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Pausar Pompeii" }));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("los géneros se renderizan antes que el botón Play para mantener alineado el botón en desktop", () => {
    render(
      <SongItem
        song={{
          ...song,
          genres: ["pop", "reggaeton"],
        }}
      />
    );

    const area = screen.getByRole("button", { name: "Reproducir Pompeii" });
    const play = screen.getByRole("button", { name: "Reproducir" });
    const genresContainer = area.nextElementSibling;
    expect(genresContainer).not.toBeNull();
    expect(genresContainer).toHaveTextContent("Pop");
    expect(genresContainer).toHaveTextContent("Reggaeton");
    expect(genresContainer!.nextElementSibling).toBe(play);
  });
});
