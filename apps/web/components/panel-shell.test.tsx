import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { User } from "@/lib/services/types";

// PanelNav relies on usePathname to highlight the active route.
vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/albums/alb-1",
}));

// BrandLogo uses next/image: render a plain <img> in jsdom.
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ""} />
  ),
}));

import { PanelShell } from "./panel-shell";

const ADMIN_USER: User = {
  id: "user-1",
  email: "admin@pulse.local",
  username: "Admin",
  is_active: true,
  is_superuser: false,
  is_verified: true,
  role: "admin",
  total_plays: 0,
};

describe("PanelShell", () => {
  it("marks /panel/artists as active when viewing an album detail route", () => {
    render(<PanelShell user={ADMIN_USER}>Contenido</PanelShell>);

    const artistsLink = screen.getByRole("link", { name: /artistas/i });
    expect(artistsLink).toHaveAttribute("href", "/panel/artists");
    expect(artistsLink).toHaveAttribute("aria-current", "page");
  });
});
