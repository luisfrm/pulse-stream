import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Playlist, Song } from "@/lib/services/types";

import { SongCard } from "./song-card";

// usePlayer: el card usa el contexto del reproductor global.
vi.mock("./player/player-provider", () => ({
  usePlayer: () => ({
    current: null,
    playing: false,
    play: vi.fn(),
    toggle: vi.fn(),
  }),
}));

// next/navigation: PlaylistPicker usa useRouter (solo si hay playlists).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/services/playlists-service", () => ({
  playlistsService: { addSong: vi.fn(), create: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const song = {
  id: "s1",
  title: "Crimen",
  artist: { id: "a1", name: "Cerati" },
} as Song;

const playlists = [
  { id: "p1", name: "Favoritas", song_count: 3, kind: "user" },
] as Playlist[];

beforeEach(() => {
  // useIsMobile (del PlaylistPicker) usa matchMedia en el mount.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
});

describe("SongCard", () => {
  it("muestra el botón + (agregar a playlist) cuando llegan playlists", async () => {
    // PlaylistPicker va en dynamic (chunk separado): resuelve async.
    render(<SongCard song={song} playlists={playlists} />);
    expect(
      await screen.findByRole("button", { name: "Agregar a playlist" })
    ).toBeInTheDocument();
  });

  it("no muestra acciones sin props (home público / cards sin sesión)", () => {
    render(<SongCard song={song} />);
    expect(
      screen.queryByRole("button", { name: "Agregar a playlist" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /favoritos/i })
    ).not.toBeInTheDocument();
  });
});