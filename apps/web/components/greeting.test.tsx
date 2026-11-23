import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Greeting } from "./greeting";

let frame: FrameRequestCallback | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Greeting", () => {
  it("recalcula el saludo con la hora del browser al montar", () => {
    // 22:00 local → "Buenas noches".
    vi.setSystemTime(new Date(2026, 10, 22, 22, 0, 0));

    render(<Greeting initial="Buenos días" name="Ana" />);
    // Primer render = el saludo del server (sin mismatch).
    expect(screen.getByText("Buenos días, Ana")).toBeInTheDocument();

    act(() => {
      frame?.(0);
    });

    expect(screen.getByText("Buenas noches, Ana")).toBeInTheDocument();
  });
});
