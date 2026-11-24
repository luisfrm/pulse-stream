import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `replace` y `params` se leen de forma diferida (dentro del factory) para que
// las constantes ya estén inicializadas cuando el componente navegue.
const replace = vi.fn();
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));

import { SearchInput } from "./search-input";

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear();
  params = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchInput", () => {
  it("adopta un cambio externo de la URL (Atrás) y NO re-navega", async () => {
    params = new URLSearchParams("q=a");
    const { rerender } = render(<SearchInput initialValue="a" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("a");

    // Atrás/Adelante: la URL cambia y el RSC re-renderiza con otro initialValue.
    params = new URLSearchParams("q=b");
    rerender(<SearchInput initialValue="b" />);

    expect(input).toHaveValue("b");

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Regresión: antes el estado local quedaba en "a" y el debounce
    // re-navegaba a "?q=a" (la URL "volvía sola" y remontaba el Suspense).
    expect(replace).not.toHaveBeenCalled();
  });

  it("en la ventana de Atrás (URL cambia antes que el prop) no hace replace fantasma", async () => {
    params = new URLSearchParams("q=a");
    const { rerender } = render(<SearchInput initialValue="a" />);

    // El popstate de Atrás flipa `useSearchParams` ANTES de que llegue el prop
    // RSC con el initialValue nuevo: solo cambia la URL.
    params = new URLSearchParams("q=b");
    rerender(<SearchInput initialValue="a" />);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(replace).not.toHaveBeenCalled();

    // Cuando llega el prop, se adopta el valor de la URL sin navegar.
    rerender(<SearchInput initialValue="b" />);
    expect(screen.getByRole("textbox")).toHaveValue("b");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("después de adoptar, tipear vuelve a navegar (flag no trabado)", async () => {
    params = new URLSearchParams("q=a");
    const { rerender } = render(<SearchInput initialValue="a" />);

    params = new URLSearchParams("q=b");
    rerender(<SearchInput initialValue="b" />);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(replace).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "rock" },
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("?q=rock", { scroll: false });
  });

  it("un cambio externo durante el tipeo no navega ni deja la URL vieja", async () => {
    params = new URLSearchParams();
    const { rerender } = render(<SearchInput initialValue="" />);

    // El usuario alcanza a tipear antes de que el debounce dispare…
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "roc" },
    });

    // …y llega un cambio externo (Atrás a otra entrada) antes de los 400 ms.
    params = new URLSearchParams("q=daddy");
    rerender(<SearchInput initialValue="daddy" />);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // La URL externa gana (se adopta) y no se dispara un replace fantasma.
    expect(screen.getByRole("textbox")).toHaveValue("daddy");
    expect(replace).not.toHaveBeenCalled();
  });

  it("navega con debounce cuando el usuario tipea", async () => {
    render(<SearchInput initialValue="" />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "rock" },
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("?q=rock", { scroll: false });
  });
});
