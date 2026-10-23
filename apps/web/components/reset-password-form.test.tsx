import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authService } from "@/lib/services/auth-service";

import { ResetPasswordForm } from "./reset-password-form";

// `token` mutable: un test cubre el caso "sin token" (link roto).
const mocks = vi.hoisted(() => ({ token: "tok", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(`token=${mocks.token}`),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/services/auth-service", () => ({
  authService: { resetPassword: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const resetPassword = vi.mocked(authService.resetPassword);

function fillPasswords(password: string, confirm: string): void {
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Repetí la contraseña"), {
    target: { value: confirm },
  });
}

function submit(): void {
  const button = screen.getByRole("button", { name: "Cambiar contraseña" });
  const form = button.closest("form");
  if (!form) throw new Error("el botón no está dentro del form");
  fireEvent.submit(form);
}

beforeEach(() => {
  mocks.token = "tok";
  mocks.replace.mockReset();
  resetPassword.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordForm", () => {
  it("sin token no muestra el formulario", () => {
    mocks.token = "";
    render(<ResetPasswordForm />);

    expect(
      screen.getByText(/El enlace no es válido o ya venció/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  });

  it("contraseñas distintas: error inline y no llama al servicio", async () => {
    render(<ResetPasswordForm />);

    fillPasswords("12345678", "87654321");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Las contraseñas no coinciden.",
    );
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("contraseña corta: error inline y no llama al servicio", async () => {
    render(<ResetPasswordForm />);

    fillPasswords("1234567", "1234567");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "al menos 8 caracteres",
    );
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("submit válido: canjea el token y vuelve al login", async () => {
    resetPassword.mockResolvedValue(null);
    render(<ResetPasswordForm />);

    fillPasswords("12345678", "12345678");
    submit();

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith("tok", "12345678"),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?reset=1"));
  });

  it("token inválido del backend: mensaje de enlace vencido + link al login", async () => {
    // El service rechaza con el código del backend (el fetch error real trae
    // `data.detail`; el componente acepta ambos shapes).
    resetPassword.mockRejectedValue(new Error("RESET_PASSWORD_BAD_TOKEN"));
    render(<ResetPasswordForm />);

    fillPasswords("12345678", "12345678");
    submit();

    expect(
      await screen.findByText(/El enlace no es válido o ya venció/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  });
});
