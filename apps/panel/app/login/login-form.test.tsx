import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/services/auth-service", () => ({
  authService: { login: vi.fn().mockResolvedValue(undefined) },
}));

import { authService } from "@/lib/services/auth-service";

import { LoginForm } from "./login-form";

function useNext(params: string | Record<string, string>) {
  mocks.searchParams = new URLSearchParams(params);
}

async function submit() {
  render(<LoginForm />);

  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "admin@pulse.test" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "secreto" },
  });
  fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

  await waitFor(() => {
    expect(authService.login).toHaveBeenCalledWith(
      "admin@pulse.test",
      "secreto",
      true
    );
  });
}

describe("Panel LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    vi.mocked(authService.login).mockResolvedValue(undefined);
  });

  it("sin next navega a /panel", async () => {
    await submit();

    expect(mocks.push).toHaveBeenCalledWith("/panel");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("conserva un next interno válido de /panel", async () => {
    useNext({ next: "/panel/songs?tab=1" });
    await submit();

    expect(mocks.push).toHaveBeenCalledWith("/panel/songs?tab=1");
  });

  it.each([
    ["externo", "https://evil.example/steal"],
    ["protocol-relative", "//evil.example/steal"],
    ["backslash", "/\\evil.example/steal"],
    ["login loop", "/login"],
    ["panel traversal", "/panel/../login"],
  ])("rechaza next %s", async (_label, next) => {
    useNext({ next });
    await submit();

    expect(mocks.push).toHaveBeenCalledWith("/panel");
  });

  it("rechaza next duplicado/array ambiguo", async () => {
    useNext("next=/panel/artists&next=/panel/songs");
    await submit();

    expect(mocks.push).toHaveBeenCalledWith("/panel");
  });

  it("muestra el error del login sin navegar", async () => {
    vi.mocked(authService.login).mockRejectedValue(new Error("Credenciales inválidas"));
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@pulse.test" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "mal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Credenciales inválidas");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
