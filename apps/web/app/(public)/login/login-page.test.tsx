import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authService } from "@/lib/services/auth-service";

import LoginPage from "@/app/(public)/login/page";

// Query mutable: cubre `/login` (normal) y `/login?reset=1`.
const mocks = vi.hoisted(() => ({ params: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.params),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    // `priority` no existe en <img> (React avisaría): se descarta.
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ""} />;
  },
}));

vi.mock("@/lib/services/auth-service", () => ({
  authService: { login: vi.fn(), forgotPassword: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const forgotPassword = vi.mocked(authService.forgotPassword);

beforeEach(() => {
  mocks.params = "";
  vi.clearAllMocks();
  forgotPassword.mockResolvedValue(null);
  // El Checkbox de Radix mide su tamaño (jsdom no implementa ResizeObserver).
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("LoginPage: ¿olvidaste tu contraseña?", () => {
  it("sin email no llama a la API y avisa", () => {
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }),
    );

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("con email pide el link y muestra el aviso persistente", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }),
    );

    await waitFor(() =>
      expect(forgotPassword).toHaveBeenCalledWith("user@example.com"),
    );
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("user@example.com");
    expect(notice).toHaveTextContent("vence en 1 hora");
  });

  it("el botón no dispara el submit del form (no intenta loguear)", () => {
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }),
    );

    expect(authService.login).not.toHaveBeenCalled();
  });

  it("?reset=1 muestra el aviso de éxito", () => {
    mocks.params = "reset=1";
    render(<LoginPage />);

    expect(
      screen.getByText("Contraseña actualizada. Iniciá sesión con la nueva."),
    ).toBeInTheDocument();
  });
});
