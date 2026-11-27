import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlaylistCover } from "./playlist-cover";

describe("PlaylistCover", () => {
  it("renders NoCover fallback when neither coverUrl nor collageUrls exist", () => {
    const { container } = render(<PlaylistCover coverUrl={null} collageUrls={[]} />);
    expect(container.querySelector('[data-slot="no-cover"]')).toBeInTheDocument();
  });

  it("prioritizes custom coverUrl over collageUrls", () => {
    render(
      <PlaylistCover
        coverUrl="https://cdn.example.com/custom.webp"
        collageUrls={[
          "https://cdn.example.com/1.webp",
          "https://cdn.example.com/2.webp",
        ]}
        alt="Mi playlist"
      />,
    );
    const img = screen.getByRole("img", { name: "Mi playlist" });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/custom.webp");
  });

  it("renders a single full-bleed image when there is 1 distinct cover", () => {
    const { container } = render(
      <PlaylistCover
        collageUrls={[
          "https://cdn.example.com/1.webp",
          "https://cdn.example.com/1.webp",
        ]}
        alt="Solo 1"
      />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "https://cdn.example.com/1.webp");
  });

  it("renders a 2-column split when there are 2 distinct covers", () => {
    const { container } = render(
      <PlaylistCover
        collageUrls={[
          "https://cdn.example.com/1.webp",
          "https://cdn.example.com/2.webp",
        ]}
        alt="Dos covers"
      />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(container.firstElementChild).toHaveClass("grid-cols-2");
    expect(container.firstElementChild).not.toHaveClass("grid-rows-2");
  });

  it("renders a bento layout (1 tall + 2 stacked) when there are 3 distinct covers", () => {
    const { container } = render(
      <PlaylistCover
        collageUrls={[
          "https://cdn.example.com/1.webp",
          "https://cdn.example.com/2.webp",
          "https://cdn.example.com/3.webp",
        ]}
        alt="Tres covers"
      />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
    expect(imgs[0]).toHaveClass("row-span-2");
  });

  it("renders a 2x2 grid capped at 4 images when there are 4+ distinct covers", () => {
    const { container } = render(
      <PlaylistCover
        collageUrls={[
          "https://cdn.example.com/1.webp",
          "https://cdn.example.com/2.webp",
          "https://cdn.example.com/3.webp",
          "https://cdn.example.com/4.webp",
          "https://cdn.example.com/5.webp",
        ]}
        alt="Cuatro covers"
      />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(4);
    expect(container.firstElementChild).toHaveClass("grid-cols-2", "grid-rows-2");
  });
});
