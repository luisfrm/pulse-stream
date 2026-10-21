import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/services/auth-service", () => ({
  authService: { login: vi.fn().mockResolvedValue(undefined) },
}));

import { authService } from "@/lib/services/auth-service";

import { LoginForm } from "./login-form";

describe("Panel LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.login).mockResolvedValue(undefined);
  });

  it("al enviar llama authService.login y navega a /panel", async () => {
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
    expect(push).toHaveBeenCalledWith("/panel");
    expect(refresh).toHaveBeenCalled();
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
    expect(push).not.toHaveBeenCalled();
  });
});
