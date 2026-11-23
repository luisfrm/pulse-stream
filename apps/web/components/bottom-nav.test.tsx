import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/navigation: BottomNav usa usePathname (activo) y useRouter (crear).
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// BrandLogo usa next/image: en jsdom renderiza un <img> plano.
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ""} />
  ),
}));

import { BottomNav } from "./bottom-nav";

describe("BottomNav", () => {
  it("navega a /catalog desde el item Catálogo", () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: /catálogo/i })).toHaveAttribute(
      "href",
      "/catalog"
    );
  });

  it("mantiene Inicio, Explorar y el botón Crear", () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: /inicio/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: /explorar/i })).toHaveAttribute(
      "href",
      "/search"
    );
    expect(screen.getByRole("button", { name: /crear/i })).toBeInTheDocument();
  });

  it("no incluye Cuenta ni Panel: viven en el sidebar", () => {
    render(<BottomNav />);
    expect(
      screen.queryByRole("link", { name: /cuenta/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /panel/i })
    ).not.toBeInTheDocument();
  });
});
