import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Album, Artist, Playlist } from "@/lib/services/types";

import { ArtistManager } from "./artist-manager";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  deleteAlbum: vi.fn(),
  reseedArtistEssentials: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/components/cover-uploader", () => ({
  CoverUploader: ({ label }: { label?: string }) => (
    <div data-testid="cover-uploader">{label}</div>
  ),
}));

vi.mock("@/lib/services/albums-service", () => ({
  albumsService: {
    delete: mocks.deleteAlbum,
    create: vi.fn(),
  },
}));

vi.mock("@/lib/services/artists-service", () => ({
  artistsService: {
    updateArtist: vi.fn(),
    deleteArtist: vi.fn(),
  },
}));

vi.mock("@/lib/services/playlists-service", () => ({
  playlistsService: {
    createArtistEssentials: vi.fn(),
    reseedArtistEssentials: mocks.reseedArtistEssentials,
  },
}));

const artist = {
  id: "a1",
  name: "Gustavo Cerati",
  cover_key: null,
  cover_url: null,
  genres: [],
  created_at: new Date().toISOString(),
} as unknown as Artist;

const emptyAlbum = {
  id: "al1",
  title: "Bocanada",
  artist_id: "a1",
  cover_key: null,
  cover_url: null,
  song_count: 0,
  created_at: new Date().toISOString(),
} as unknown as Album;

const nonEmptyAlbum = {
  id: "al2",
  title: "Ahí vamos",
  artist_id: "a1",
  cover_key: null,
  cover_url: null,
  song_count: 3,
  created_at: new Date().toISOString(),
} as unknown as Album;

const essentials = {
  id: "pl1",
  name: "Gustavo Cerati Essentials",
  description: null,
  kind: "system",
  is_public: true,
  song_count: 5,
  created_at: new Date().toISOString(),
} as unknown as Playlist;

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

describe("ArtistManager · album deletion modal", () => {
  it("opens confirmation modal on first click without deleting immediately", async () => {
    const onMutated = vi.fn().mockResolvedValue(undefined);
    mocks.deleteAlbum.mockResolvedValue(undefined);

    render(
      <ArtistManager
        artist={artist}
        albums={[emptyAlbum]}
        songs={[]}
        collaborations={[]}
        essentials={null}
        onMutated={onMutated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Borrar Bocanada" }));

    expect(mocks.deleteAlbum).not.toHaveBeenCalled();
    expect(
      await screen.findByText("¿Borrar este álbum?")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '"Bocanada" se eliminará. Esta acción no se puede deshacer.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(mocks.deleteAlbum).toHaveBeenCalledWith("al1"));
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("explains that songs must be reassigned first and disables confirm when album has songs", async () => {
    render(
      <ArtistManager
        artist={artist}
        albums={[nonEmptyAlbum]}
        songs={[]}
        collaborations={[]}
        essentials={null}
        onMutated={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Borrar Ahí vamos" }));

    expect(mocks.deleteAlbum).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        '"Ahí vamos" tiene 3 canciones: primero reasignalas a otro álbum (las canciones requieren álbum).'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sí, eliminar" })
    ).toBeDisabled();
  });

  it("closes album deletion modal on Cancelar without calling delete", async () => {
    render(
      <ArtistManager
        artist={artist}
        albums={[emptyAlbum]}
        songs={[]}
        collaborations={[]}
        essentials={null}
        onMutated={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Borrar Bocanada" }));
    expect(
      await screen.findByText("¿Borrar este álbum?")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(
        screen.queryByText("¿Borrar este álbum?")
      ).not.toBeInTheDocument()
    );
    expect(mocks.deleteAlbum).not.toHaveBeenCalled();
  });
});

describe("ArtistManager · Essentials re-seed modal", () => {
  it("opens confirmation modal without window.confirm and reseeds on confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const onMutated = vi.fn().mockResolvedValue(undefined);
    mocks.reseedArtistEssentials.mockResolvedValue({
      ...essentials,
      song_count: 8,
    });

    render(
      <ArtistManager
        artist={artist}
        albums={[]}
        songs={[]}
        collaborations={[]}
        essentials={essentials}
        onMutated={onMutated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-sembrar" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.reseedArtistEssentials).not.toHaveBeenCalled();
    expect(
      await screen.findByText("¿Re-sembrar Essentials?")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sí, re-sembrar" }));

    await waitFor(() =>
      expect(mocks.reseedArtistEssentials).toHaveBeenCalledWith("pl1")
    );
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });
});
