import "@testing-library/jest-dom/vitest";

// Radix (Checkbox/Dialog) usa ResizeObserver; jsdom no lo implementa.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
