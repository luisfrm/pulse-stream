import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Chips } from "./chips";

// Query mutable + router.replace espiado (mismo patrón que login-page.test).
const mocks = vi.hoisted(() => ({
  params: "tipo=canciones",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.params),
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: mocks.replace }),
}));

const chips = [{ value: "canciones", label: "Canciones" }];

beforeEach(() => {
  mocks.params = "tipo=canciones";
  vi.clearAllMocks();
});

describe("Chips", () => {
  it("click en el chip activo borra el param de la URL", () => {
    render(<Chips chips={chips} />);

    fireEvent.click(screen.getByRole("button", { name: "Canciones" }));

    expect(mocks.replace).toHaveBeenCalledWith("/dashboard", { scroll: false });
  });
});
