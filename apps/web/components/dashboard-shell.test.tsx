import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// El shell usa usePathname (item activo) y renderiza BottomNav (useRouter).
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

import { DashboardShell } from "./dashboard-shell";

describe("DashboardShell", () => {
  it("Cuenta vive en el sidebar y Panel solo aparece para admins", () => {
    const { rerender } = render(
      <DashboardShell isAdmin={false}>Contenido</DashboardShell>
    );

    expect(screen.getByRole("link", { name: /cuenta/i })).toHaveAttribute(
      "href",
      "/account"
    );
    expect(
      screen.queryByRole("link", { name: /panel/i })
    ).not.toBeInTheDocument();

    rerender(<DashboardShell isAdmin>Contenido</DashboardShell>);

    expect(screen.getByRole("link", { name: /panel/i })).toHaveAttribute(
      "href",
      "/panel"
    );
  });
});
