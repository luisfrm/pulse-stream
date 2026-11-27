import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Playlist, PlaylistDetail, Song } from "@/lib/services/types";

import { PlaylistsManager } from "./playlists-manager";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  getPlaylistById: vi.fn(),
  addSong: vi.fn(),
  delete: vi.fn(),
  getSongs: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/services/playlists-service", () => ({
  playlistsService: {
    getPlaylistById: mocks.getPlaylistById,
    addSong: mocks.addSong,
    removeSong: vi.fn(),
    delete: mocks.delete,
  },
}));

vi.mock("@/lib/services/songs-service", () => ({
  songsService: { getSongs: mocks.getSongs },
}));

const playlist = {
  id: "p1",
  name: "Curada",
  description: null,
  kind: "system",
  is_public: true,
  song_count: 0,
  created_at: new Date().toISOString(),
} as Playlist;

const detail = { ...playlist, songs: [] } as PlaylistDetail;

const song = {
  id: "s1",
  title: "Daria",
  artist: { id: "a1", name: "Daddy Yankee" },
} as Song;

beforeEach(() => {
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PlaylistsManager · curación", () => {
  it("un segundo click con una mutación en vuelo no dispara otra llamada", async () => {
    mocks.getPlaylistById.mockResolvedValue(detail);
    mocks.getSongs.mockResolvedValue({
      items: [song],
      total: 1,
      offset: 0,
      limit: 10,
    });

    let resolveAdd: ((value: PlaylistDetail) => void) | undefined;
    mocks.addSong.mockImplementation(
      () =>
        new Promise<PlaylistDetail>((resolve) => {
          resolveAdd = resolve;
        })
    );

    render(
      <PlaylistsManager
        initialPlaylists={[playlist]}
        onMutated={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Canciones/ }));
    await waitFor(() =>
      expect(mocks.getPlaylistById).toHaveBeenCalledTimes(1)
    );

    fireEvent.change(screen.getByLabelText("Agregar canción"), {
      target: { value: "Daria" },
    });
    await waitFor(() => expect(mocks.getSongs).toHaveBeenCalled(), {
      timeout: 1500,
    });

    const result = await screen.findByRole("button", { name: /Daria/ });
    fireEvent.click(result);
    await waitFor(() => expect(mocks.addSong).toHaveBeenCalledTimes(1));

    // Segundo click mientras la primera mutación sigue pendiente: guard.
    fireEvent.click(screen.getByRole("button", { name: /Daria/ }));
    expect(mocks.addSong).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAdd?.(detail);
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });
});

describe("PlaylistsManager · delete modal", () => {
  it("opens confirmation modal without window.confirm and deletes only on confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const onMutated = vi.fn().mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);

    render(
      <PlaylistsManager
        initialPlaylists={[playlist]}
        onMutated={onMutated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Borrar Curada" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(
      await screen.findByText("¿Borrar esta playlist del sistema?")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("closes confirmation modal on Cancelar without calling delete", async () => {
    render(
      <PlaylistsManager
        initialPlaylists={[playlist]}
        onMutated={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Borrar Curada" }));
    expect(
      await screen.findByText("¿Borrar esta playlist del sistema?")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(
        screen.queryByText("¿Borrar esta playlist del sistema?")
      ).not.toBeInTheDocument()
    );
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
