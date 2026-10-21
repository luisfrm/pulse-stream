import type * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

// Modal real usa Radix + matchMedia; para el test del ZIP alcanza con mostrar
// título/descripción y children cuando está abierto.
vi.mock("@pulse-stream/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pulse-stream/ui")>();
  return {
    ...actual,
    Modal: ({
      open,
      title,
      description,
      children,
    }: {
      open: boolean;
      title?: React.ReactNode;
      description?: React.ReactNode;
      children: React.ReactNode;
    }) =>
      open ? (
        <div role="dialog" aria-label={typeof title === "string" ? title : "modal"}>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
          {children}
        </div>
      ) : null,
  };
});

vi.mock("@/lib/services/albums-service", () => ({
  albumsService: {
    importZip: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { albumsService } from "@/lib/services/albums-service";
import type { AlbumDetail } from "@/lib/services/types";

import { AlbumManager } from "./album-manager";

const album = {
  id: "al1",
  title: "Bocanada",
  artist: { id: "ar1", name: "Cerati" },
  cover_key: null,
  cover_url: null,
  songs: [],
} as unknown as AlbumDetail;

function selectZip(file: File) {
  const input = screen.getByLabelText("Seleccionar archivo ZIP") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("AlbumManager · import ZIP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el ZipImportResult con importadas/saltadas/fallidas", async () => {
    const zip = new File(["zip"], "album.zip", { type: "application/zip" });
    vi.mocked(albumsService.importZip).mockResolvedValue({
      imported: [{ id: "s1" }, { id: "s2" }],
      skipped: [{ name: "dup.mp3", reason: "ya existe" }],
      failed: [{ name: "nota.txt", reason: "no es audio" }],
    } as never);
    const onMutated = vi.fn().mockResolvedValue(undefined);

    render(<AlbumManager album={album} onMutated={onMutated} />);
    selectZip(zip);

    expect(await screen.findByText("Importación desde ZIP")).toBeInTheDocument();
    expect(
      screen.getByText(/2 canciones importadas · 1 saltadas · 1 fallidas/i)
    ).toBeInTheDocument();
    expect(screen.getByText("dup.mp3")).toBeInTheDocument();
    expect(screen.getByText("ya existe")).toBeInTheDocument();
    expect(screen.getByText("nota.txt")).toBeInTheDocument();
    expect(screen.getByText("no es audio")).toBeInTheDocument();
    expect(albumsService.importZip).toHaveBeenCalledWith("al1", zip);
    expect(onMutated).toHaveBeenCalled();
  });

  it("muestra el error si el import falla y no abre el resultado", async () => {
    vi.mocked(albumsService.importZip).mockRejectedValue(
      new Error("El ZIP está corrupto")
    );
    const zip = new File(["zip"], "album.zip", { type: "application/zip" });

    render(<AlbumManager album={album} onMutated={vi.fn()} />);
    selectZip(zip);

    await waitFor(() => {
      expect(screen.getByText("El ZIP está corrupto")).toBeInTheDocument();
    });
    expect(screen.queryByText("Importación desde ZIP")).not.toBeInTheDocument();
  });

  it("rechaza un archivo que no es .zip sin llamar al servicio", async () => {
    render(<AlbumManager album={album} onMutated={vi.fn()} />);
    selectZip(new File(["txt"], "album.txt", { type: "text/plain" }));

    expect(await screen.findByText(/elegí un archivo .zip/i)).toBeInTheDocument();
    expect(albumsService.importZip).not.toHaveBeenCalled();
  });
});
