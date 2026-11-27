import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AlbumDetail, Artist } from "@/lib/services/types";

import { AlbumManager } from "./album-manager";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  uploadAndCreateSong: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/utils/song-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/song-upload")>();
  return {
    ...actual,
    uploadAndCreateSong: mocks.uploadAndCreateSong,
  };
});

const artist: Artist = {
  id: "art-1",
  name: "Soda Stereo",
  bio: null,
  image_url: null,
  cover_key: null,
  created_at: new Date().toISOString(),
} as Artist;

const album: AlbumDetail = {
  id: "alb-1",
  title: "Canción Animal",
  artist: { id: artist.id, name: artist.name },
  cover_url: null,
  cover_key: null,
  songs: [],
  created_at: new Date().toISOString(),
} as unknown as AlbumDetail;

describe("AlbumManager in-context song upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadAndCreateSong.mockResolvedValue({ id: "song-1" });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("uploads song via 'Subir canción', refreshes album, keeps modal open, and never navigates away", async () => {
    const onMutated = vi.fn().mockResolvedValue(undefined);
    render(
      <AlbumManager
        album={album}
        genres={["rock"]}
        artists={[artist]}
        onMutated={onMutated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /subir canción a este álbum/i }));
    expect(screen.getByText("Subir canción al álbum")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    const fileInput = document.querySelector('input[type="file"][accept*="audio"]') as HTMLInputElement;
    const audioFile = new File(["audio"], "track.mp3", { type: "audio/mpeg" });
    fireEvent.change(fileInput, { target: { files: [audioFile] } });

    fireEvent.change(screen.getByPlaceholderText("Ej. De Música Ligera"), {
      target: { value: "De Música Ligera" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^subir canción$/i }));

    await waitFor(() => {
      expect(mocks.uploadAndCreateSong).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "De Música Ligera",
          artistId: "art-1",
          albumId: "alb-1",
        })
      );
    });
    expect(onMutated).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByText("Subir canción al álbum")).toBeInTheDocument();
    expect(
      screen.getByText(/"De Música Ligera" se agregó al álbum\. Podés subir otra\./i)
    ).toBeInTheDocument();
  });

  it("closes modal when clicking 'Cerrar' without navigating away", () => {
    const onMutated = vi.fn().mockResolvedValue(undefined);
    render(
      <AlbumManager
        album={album}
        genres={["rock"]}
        artists={[artist]}
        onMutated={onMutated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /subir canción a este álbum/i }));
    expect(screen.getByText("Subir canción al álbum")).toBeInTheDocument();

    const closeButton = screen
      .getAllByRole("button", { name: /^cerrar$/i })
      .find((button) => button.textContent?.trim() === "Cerrar");
    expect(closeButton).toBeDefined();
    fireEvent.click(closeButton!);

    expect(screen.queryByText("Subir canción al álbum")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
