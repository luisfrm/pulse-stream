import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authService } from "@/lib/services/auth-service";

import { LoginForm } from "./login-form";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/services/auth-service", () => ({
  authService: { login: vi.fn() },
}));

describe("LoginForm (email/usuario + password)", () => {
  beforeEach(() => {
    vi.mocked(authService.login).mockReset();
    vi.mocked(authService.login).mockResolvedValue(undefined);
    push.mockReset();
    refresh.mockReset();
  });

  it("envía identifier/password y navega a next", async () => {
    render(<LoginForm next="/catalog" />);

    fireEvent.change(screen.getByLabelText("Email o usuario"), {
      target: { value: "panel-admin" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "Password-123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() =>
      expect(authService.login).toHaveBeenCalledWith({
        identifier: "panel-admin",
        password: "Password-123!",
      }),
    );
    expect(push).toHaveBeenCalledWith("/catalog");
    expect(refresh).toHaveBeenCalled();
  });

  it("muestra el error de credenciales inválidas", async () => {
    vi.mocked(authService.login).mockRejectedValue(
      new Error("Credenciales inválidas"),
    );

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email o usuario"), {
      target: { value: "nadie@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /credenciales inválidas/i,
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
