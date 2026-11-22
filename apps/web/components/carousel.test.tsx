import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Carousel } from "./carousel";

// jsdom no implementa ResizeObserver ni layout: se mockean las medidas.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
    configurable: true,
    value: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { scrollLeft?: number }).scrollLeft;
});

describe("Carousel", () => {
  it("habilita la flecha siguiente cuando hay overflow", async () => {
    render(
      <Carousel>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>Card {i}</div>
        ))}
      </Carousel>
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled()
    );
  });
});
