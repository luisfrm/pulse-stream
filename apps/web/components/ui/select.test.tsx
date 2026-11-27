import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Select } from "./select";

describe("Select async search", () => {
  const options = [
    { value: "1", label: "Soda Stereo" },
    { value: "2", label: "Charly García" },
  ];

  it("calls onSearchChange when typing and resets query when closing", () => {
    const onSearchChange = vi.fn();
    render(
      <Select
        label="Artista"
        options={options}
        value=""
        onChange={vi.fn()}
        searchable
        onSearchChange={onSearchChange}
      />
    );

    fireEvent.click(screen.getByRole("combobox"));
    const searchInput = screen.getByPlaceholderText("Buscar…");
    fireEvent.change(searchInput, { target: { value: "soda" } });

    expect(onSearchChange).toHaveBeenCalledWith("soda");

    // Selecting an option closes the dropdown and resets the search query.
    fireEvent.click(screen.getByRole("option", { name: "Soda Stereo" }));
    expect(onSearchChange).toHaveBeenLastCalledWith("");
  });

  it("shows loading indicator and hides emptyLabel while loading", () => {
    render(
      <Select
        label="Artista"
        options={[]}
        value=""
        onChange={vi.fn()}
        searchable
        loading
        emptyLabel="Sin opciones"
      />
    );

    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("status")).toHaveTextContent("Buscando…");
    expect(screen.queryByText("Sin opciones")).not.toBeInTheDocument();
  });
});
