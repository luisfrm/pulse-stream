import { describe, expect, it } from "vitest";

import {
  authorHandle,
  firstNameFromEmail,
  formatBytes,
  formatTime,
  greetingForHour,
} from "./format";

describe("authorHandle", () => {
  it("devuelve el handle legible desde un email", () => {
    expect(authorHandle("maria.lopez@example.com")).toBe("maria lopez");
    expect(authorHandle("tomas_rojas@x.com")).toBe("tomas rojas");
    expect(authorHandle("juanca@x.com")).toBe("juanca");
  });

  it("resiste emails vacíos o sin sesión", () => {
    expect(authorHandle(null)).toBe("Pulse Stream");
    expect(authorHandle(undefined)).toBe("Pulse Stream");
    expect(authorHandle("")).toBe("Pulse Stream");
  });
});

describe("formatTime", () => {
  it("formatea segundos a m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(7)).toBe("0:07");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
  });

  it("resiste valores inválidos", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
    expect(formatTime(-5)).toBe("0:00");
  });
});

describe("formatBytes", () => {
  it("formatea bytes a MB/GB", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3.4 * 1024 * 1024 * 1024)).toBe("3.4 GB");
  });

  it("resiste valores no numéricos", () => {
    expect(formatBytes(NaN)).toBe("0 MB");
    expect(formatBytes(-1)).toBe("0 MB");
  });
});

describe("firstNameFromEmail", () => {
  it("extrae el primer nombre capitalizado", () => {
    expect(firstNameFromEmail("maria.lopez@x.com")).toBe("Maria");
    expect(firstNameFromEmail("tomas_rojas@x.com")).toBe("Tomas");
    expect(firstNameFromEmail("juan@x.com")).toBe("Juan");
  });
});

describe("greetingForHour", () => {
  it("saluda según la franja horaria", () => {
    expect(greetingForHour(2)).toBe("Buenas noches");
    expect(greetingForHour(9)).toBe("Buenos días");
    expect(greetingForHour(15)).toBe("Buenas tardes");
    expect(greetingForHour(22)).toBe("Buenas noches");
  });
});