import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaCard } from "./media-card";

const base = { title: "Crimen", href: "/song/s1" };

describe("MediaCard", () => {
  it("llama onPlay una sola vez al click en el play", () => {
    const onPlay = vi.fn();
    render(<MediaCard {...base} onPlay={onPlay} />);

    fireEvent.click(screen.getByRole("button", { name: /Reproducir/ }));

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("usa Pausar cuando la card está sonando", () => {
    render(<MediaCard {...base} playing onPlay={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Pausar Crimen" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reproducir/ })
    ).not.toBeInTheDocument();
  });

  it("sin onPlay no renderiza el botón de play", () => {
    render(<MediaCard {...base} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
