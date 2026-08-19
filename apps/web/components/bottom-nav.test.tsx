import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { User } from "@/lib/services/types";

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

const user = {
  id: "u1",
  email: "maria@example.com",
  username: "maria",
  role: null,
  is_superuser: false,
} as User;

describe("BottomNav", () => {
  it("navega a /catalog desde el item Catálogo", () => {
    render(<BottomNav user={user} isAdmin={false} />);
    expect(screen.getByRole("link", { name: /catálogo/i })).toHaveAttribute(
      "href",
      "/catalog"
    );
  });

  it("navega a /account desde el item Cuenta", () => {
    render(<BottomNav user={user} isAdmin={false} />);
    expect(screen.getByRole("link", { name: /cuenta/i })).toHaveAttribute(
      "href",
      "/account"
    );
  });

  it("mantiene Inicio, Buscar y el botón Crear", () => {
    render(<BottomNav user={user} isAdmin={false} />);
    expect(screen.getByRole("link", { name: /inicio/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: /buscar/i })).toHaveAttribute(
      "href",
      "/search"
    );
    expect(screen.getByRole("button", { name: /crear/i })).toBeInTheDocument();
  });

  it("muestra Panel solo para admins", () => {
    const { rerender } = render(<BottomNav user={user} isAdmin={false} />);
    expect(screen.queryByRole("link", { name: /panel/i })).not.toBeInTheDocument();

    rerender(<BottomNav user={user} isAdmin={true} />);
    expect(screen.getByRole("link", { name: /panel/i })).toHaveAttribute(
      "href",
      "/panel"
    );
  });
});