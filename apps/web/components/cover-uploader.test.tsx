import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CoverUploader } from "./cover-uploader";

// Mock de la subida: el presign y el PUT a R2 no tocan red en tests.
vi.mock("@/lib/services/uploads-service", () => ({
  uploadsService: {
    presignCover: vi.fn().mockResolvedValue({
      url: "https://presign.example.com/put",
      object_key: "covers/test-123.jpg",
      expires_in: 600,
    }),
  },
  uploadToR2: vi.fn().mockResolvedValue(undefined),
}));

const objectUrls: string[] = [];
let urlCounter = 0;

beforeEach(() => {
  urlCounter = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => {
        urlCounter += 1;
        const url = `blob:cover-preview-${urlCounter}`;
        objectUrls.push(url);
        return url;
      }),
      revokeObjectURL: vi.fn((u: string) => {
        const i = objectUrls.indexOf(u);
        if (i >= 0) objectUrls.splice(i, 1);
      }),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  objectUrls.length = 0;
  vi.clearAllMocks();
});

function selectFile(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("CoverUploader", () => {
  it("muestra el preview local del archivo apenas se elige (no espera el RSC)", async () => {
    const onChange = vi.fn();
    render(<CoverUploader value={null} onChange={onChange} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["data"], "cover.jpg", { type: "image/jpeg" });
    selectFile(fileInput, file);

    // El <img> aparece con la URL local (object URL) sin esperar el servidor.
    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "blob:cover-preview-1");

    // Tras subir, onChange recibe el object_key confirmado.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("covers/test-123.jpg"));
  });

  it("rechaza un tipo de archivo no permitido sin subir ni mostrar preview", async () => {
    const onChange = vi.fn();
    render(<CoverUploader value={null} onChange={onChange} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["data"], "video.mp4", { type: "video/mp4" });
    selectFile(fileInput, file);

    expect(await screen.findByText(/solo se aceptan/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("usa el previewUrl del servidor cuando no hay archivo local nuevo", () => {
    render(
      <CoverUploader
        value="covers/x.jpg"
        previewUrl="https://media.example.com/covers/x.jpg"
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://media.example.com/covers/x.jpg"
    );
  });
});
