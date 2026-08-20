import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { playlistsService } from "@/lib/services/playlists-service";
import type { MyPlaylist, Playlist, Song } from "@/lib/services/types";

import { PlaylistPicker } from "./playlist-picker";

// next/navigation: el picker usa useRouter (refresh tras mutar).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/services/playlists-service", () => ({
  playlistsService: {
    addSong: vi.fn(),
    removeSong: vi.fn(),
    create: vi.fn(),
  },
}));

// sonner: el toast funciona sin el Toaster montado en tests.
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const song = {
  id: "s1",
  title: "Crimen",
  artist: { id: "a1", name: "Cerati" },
} as Song;

const playlists = [
  { id: "p1", name: "Favoritas", song_count: 3, kind: "user" },
  { id: "p2", name: "Gimnasio", song_count: 12, kind: "user" },
] as Playlist[];

beforeEach(() => {
  // Desktop (matchMedia false → useIsMobile false): el picker abre un popover.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaylistPicker", () => {
  it("lista las playlists con nombre y cantidad de canciones", () => {
    render(<PlaylistPicker song={song} playlists={playlists} />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar a playlist" }));

    expect(screen.getByText("Favoritas")).toBeInTheDocument();
    expect(screen.getByText("3 canciones")).toBeInTheDocument();
    expect(screen.getByText("Gimnasio")).toBeInTheDocument();
    expect(screen.getByText("12 canciones")).toBeInTheDocument();
  });

  it("agrega la canción a la playlist elegida y cierra el dropdown", async () => {
    const onMutated = vi.fn().mockResolvedValue(undefined);
    render(
      <PlaylistPicker song={song} playlists={playlists} onMutated={onMutated} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Agregar a playlist" }));
    fireEvent.click(screen.getByRole("button", { name: /favoritas/i }));

    await waitFor(() => {
      expect(playlistsService.addSong).toHaveBeenCalledWith("p1", "s1");
    });
    expect(onMutated).toHaveBeenCalled();
    // El dropdown se cierra tras agregar.
    expect(
      screen.queryByRole("button", { name: /favoritas/i })
    ).not.toBeInTheDocument();
  });

  it("crea una playlist nueva y le agrega la canción", async () => {
    vi.mocked(playlistsService.create).mockResolvedValue({
      id: "p3",
      name: "Para el viaje",
      song_count: 0,
      kind: "user",
      is_public: false,
    } as never);

    render(<PlaylistPicker song={song} playlists={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar a playlist" }));
    fireEvent.click(screen.getByRole("button", { name: /nueva playlist/i }));
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Para el viaje" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear y agregar/i }));

    await waitFor(() => {
      expect(playlistsService.create).toHaveBeenCalledWith({
        name: "Para el viaje",
        description: undefined,
      });
    });
    expect(playlistsService.addSong).toHaveBeenCalledWith("p3", "s1");
  });

  it("muestra check verde en la playlist que ya contiene la canción (toggle)", () => {
    const withSong = [
      {
        id: "p1",
        name: "Favoritas",
        song_count: 3,
        kind: "user",
        is_public: false,
        created_at: "2026-01-01T00:00:00Z",
        song_ids: ["s1", "s9"],
      },
      {
        id: "p2",
        name: "Gimnasio",
        song_count: 12,
        kind: "user",
        is_public: false,
        created_at: "2026-01-01T00:00:00Z",
        song_ids: [],
      },
    ] as MyPlaylist[];

    render(<PlaylistPicker song={song} playlists={withSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar a playlist" }));

    // Contenida → sigue clickeable (toggle) con la etiqueta de ya contenida.
    const contained = screen.getByRole("button", { name: /favoritas/i });
    expect(contained).toBeEnabled();
    expect(screen.getByText("Ya está en esta playlist")).toBeInTheDocument();

    // No contenida → habilitada y con el contador normal.
    const available = screen.getByRole("button", { name: /gimnasio/i });
    expect(available).toBeEnabled();
    expect(screen.getByText("12 canciones")).toBeInTheDocument();
  });

  it("quita la canción de la playlist que ya la contiene (toggle)", async () => {
    const withSong = [
      {
        id: "p1",
        name: "Favoritas",
        song_count: 3,
        kind: "user",
        is_public: false,
        created_at: "2026-01-01T00:00:00Z",
        song_ids: ["s1"],
      },
    ] as MyPlaylist[];

    render(<PlaylistPicker song={song} playlists={withSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar a playlist" }));
    fireEvent.click(screen.getByRole("button", { name: /favoritas/i }));

    await waitFor(() => {
      expect(playlistsService.removeSong).toHaveBeenCalledWith("p1", "s1");
    });
    expect(playlistsService.addSong).not.toHaveBeenCalled();
  });
});