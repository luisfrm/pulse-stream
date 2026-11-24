import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAYER_SESSION_KEY } from "@/lib/player/persisted-session";
import { listensService } from "@/lib/services/listens-service";
import { songsService } from "@/lib/services/songs-service";
import type { Page, Song } from "@/lib/services/types";

// La fábrica anclada habla con la API: se mockea el service (sin red).
vi.mock("@/lib/services/songs-service", () => ({
  songsService: { getSongs: vi.fn() },
}));

// El provider registra listens: sin red en jsdom.
vi.mock("@/lib/services/listens-service", () => ({
  listensService: { recordPlay: vi.fn().mockResolvedValue({}) },
}));

import { songAnchoredContext } from "./play-contexts";
import {
  PlayerProvider,
  usePlayer,
  type PlayContext,
} from "./player-provider";

const getSongsMock = vi.mocked(songsService.getSongs);
const recordPlayMock = vi.mocked(listensService.recordPlay);

/** Página del mock con el shape exacto (`Page<Song>`) que exige el service. */
function pageOf(items: Song[], total = items.length): Page<Song> {
  return { items, total, offset: 0, limit: 50 };
}

type Player = ReturnType<typeof usePlayer>;

function song(id: string): Song {
  return {
    id,
    title: `Canción ${id}`,
    artist: { id: "artist-1", name: "Artista" },
    object_key: `songs/${id}.mp3`,
    created_at: "2026-01-01T00:00:00Z",
    stream_url: `https://cdn.test/${id}.mp3`,
  } as Song;
}

/** <audio> de mentira: jsdom no implementa la reproducción real. */
class FakeAudio {
  static instances: FakeAudio[] = [];

  src = "";
  preload = "";
  paused = true;
  currentTime = 0;
  duration = 0;
  /** Cuántas veces se llamó `play()` (el restore no debe llamarlo). */
  playCalls = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, handler: () => void) {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: () => void) {
    this.listeners.get(type)?.delete(handler);
  }

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  /** Dispara un evento del <audio> (p. ej. "ended", "play") a sus listeners. */
  emit(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler();
  }
}

function lastAudio(): FakeAudio {
  const audio = FakeAudio.instances.at(-1);
  if (!audio) throw new Error("El provider todavía no creó el <audio>");
  return audio;
}

// Captura del usePlayer() sin mutar nada desde el componente (regla
// react-hooks/immutability): el Probe entrega el valor por callback y la
// arrow que guarda vive en renderPlayer (función común, no componente).
const capturedRef: { current: Player | null } = { current: null };

function Probe({ onCapture }: { onCapture: (player: Player) => void }) {
  onCapture(usePlayer());
  return null;
}

function renderPlayer() {
  render(
    <PlayerProvider>
      <Probe onCapture={(p) => (capturedRef.current = p)} />
    </PlayerProvider>,
  );
}

/** Lee el usePlayer() capturado por el Probe (falla explícito si no montó). */
function getPlayer(): Player {
  if (!capturedRef.current) throw new Error("Probe no montó aún");
  return capturedRef.current;
}

beforeEach(() => {
  FakeAudio.instances = [];
  vi.clearAllMocks();
  // Sin esto un test deja un blob persistido y el siguiente monta restaurado.
  sessionStorage.clear();
  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlayerProvider — cola por contexto (Q1)", () => {
  it("next() al final del seed usa la página prefetcheada y avanza", async () => {
    const seed = [song("1"), song("2")];
    const loadPage = vi.fn().mockResolvedValue([song("3"), song("4")]);
    renderPlayer();

    await act(async () => {
      getPlayer().play(seed[0], { label: "ctx", seed, loadPage, total: 4 });
    });
    expect(getPlayer().contextLabel).toBe("ctx");

    // El prefetch anticipado (2 de margen) ya trajo la página sola.
    await waitFor(() =>
      expect(getPlayer().queue.map((item) => item.id)).toEqual([
        "1",
        "2",
        "3",
        "4",
      ]),
    );
    expect(loadPage).toHaveBeenCalledTimes(1);
    // La página siguiente arranca donde terminó la semilla, con el tope del motor.
    expect(loadPage).toHaveBeenCalledWith(2, 50);
    expect(getPlayer().current?.id).toBe("1");

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("2");

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("3");
    expect(getPlayer().hasNext).toBe(true);

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("4");
    // total conocido (4) y offset consumido: no queda nada por pedir DEL
    // CONTEXTO. Con la radio encadenada (Q4) siempre hay siguiente posible
    // mientras suene algo — como Spotify, el botón no se deshabilita.
    expect(getPlayer().hasNext).toBe(true);

    // La radio no encuentra nada nuevo (mock explícito de página vacía):
    // cadena estéril → recién ahí se detiene.
    getSongsMock.mockResolvedValue(pageOf([]));
    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("4");
    expect(getPlayer().hasNext).toBe(false);
  });

  it("si la página siguiente viene vacía, se detiene sin ciclar", async () => {
    const loadPage = vi.fn().mockResolvedValue([]);
    // Mock explícito (no heredado de otro test): la radio encadenada también
    // viene vacía → cadena estéril → stop real.
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(song("1"), { label: "fin", seed: [song("1")], loadPage });
    });

    await act(async () => getPlayer().next());

    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(getPlayer().current?.id).toBe("1");
    expect(getPlayer().hasNext).toBe(false);

    // Un segundo intento no vuelve a pedir la página (agotado).
    await act(async () => getPlayer().next());
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it("un array (cola fija) prefetchea la radio; la cadena estéril lo detiene", async () => {
    const items = [song("1"), song("2")];
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(items[0], items);
    });
    expect(getPlayer().contextLabel).toBeNull();

    // El prefetch ya intentó encadenar la radio (estéril): no agregó nada.
    await waitFor(() => expect(getSongsMock).toHaveBeenCalled());
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["1", "2"]);

    act(() => getPlayer().next());
    expect(getPlayer().current?.id).toBe("2");

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("2");
    expect(getPlayer().hasNext).toBe(false);
  });

  it("Q4: un fallo de red en la radio NO latchea; el próximo next reintenta", async () => {
    const a1 = song("a1");
    getSongsMock.mockRejectedValue(new Error("offline"));
    renderPlayer();

    await act(async () => {
      getPlayer().play(a1, [a1]);
    });
    await act(async () => getPlayer().next());
    // Falló por red (no por esterilidad): sigue habiendo siguiente posible.
    expect(getPlayer().hasNext).toBe(true);

    // La red vuelve y el retry produce canciones: la cadena avanza.
    const fresh = song("b-new");
    getSongsMock.mockResolvedValue(pageOf([fresh], 1));
    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("b-new");
  });

  it("Q4: la cadena estéril se resetea con un play() nuevo", async () => {
    const a1 = song("a1");
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(a1, [a1]);
    });
    await act(async () => getPlayer().next());
    expect(getPlayer().hasNext).toBe(false);

    // Reproducir otra cosa reactiva el autoplay: con el catálogo estéril se
    // vuelve a latchear al toque, así que lo observable es el NUEVO intento.
    const calls = getSongsMock.mock.calls.length;
    const b1 = song("b1");
    await act(async () => {
      getPlayer().play(b1, [b1]);
    });
    await waitFor(() =>
      expect(getSongsMock.mock.calls.length).toBeGreaterThan(calls),
    );
  });

  it("dos next() con el fetch en vuelo comparten una sola página", async () => {
    let resolveFetch: ((songs: Song[]) => void) | undefined;
    const loadPage = vi.fn(
      () =>
        new Promise<Song[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    renderPlayer();

    const seed = [song("1"), song("2")];
    await act(async () => {
      getPlayer().play(seed[0], { label: "ctx", seed, loadPage, total: 4 });
    });

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("2");

    // Dos avances seguidos en el borde: el segundo se encola sobre el fetch.
    await act(async () => {
      getPlayer().next();
      getPlayer().next();
    });
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(getPlayer().current?.id).toBe("2");

    await act(async () => {
      resolveFetch?.([song("3"), song("4")]);
    });

    await waitFor(() => expect(getPlayer().queue).toHaveLength(4));
    // El primer next arranca "3"; el segundo, ya sobre la cola extendida, "4".
    expect(getPlayer().current?.id).toBe("4");
  });

  it("si otra superficie reproduce durante el fetch, la página vieja NO entra", async () => {
    let resolveOld: ((songs: Song[]) => void) | undefined;
    const oldLoadPage = vi.fn(
      () =>
        new Promise<Song[]>((resolve) => {
          resolveOld = resolve;
        }),
    );
    renderPlayer();

    const seedA = [song("a1"), song("a2")];
    await act(async () => {
      getPlayer().play(seedA[0], {
        label: "A",
        seed: seedA,
        loadPage: oldLoadPage,
        total: 3,
      });
    });
    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("a2");

    // next() al borde: la página de A queda en vuelo.
    await act(async () => getPlayer().next());
    expect(oldLoadPage).toHaveBeenCalledTimes(1);

    // Otra superficie toma el control antes de que resuelva.
    const seedB = [song("b1"), song("b2")];
    await act(async () => {
      getPlayer().play(seedB[0], { label: "B", seed: seedB, total: 2 });
    });

    // Llega la página VIEJA: no debe tocar la cola nueva.
    await act(async () => {
      resolveOld?.([song("a3")]);
    });
    await waitFor(() => expect(getPlayer().contextLabel).toBe("B"));
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["b1", "b2"]);
    expect(getPlayer().current?.id).toBe("b1");

    // Y el avance sigue la cola de B (el contexto nuevo quedó intacto).
    act(() => getPlayer().next());
    expect(getPlayer().current?.id).toBe("b2");
  });

  it("un contexto sin seed encuentra la canción pedida aunque esté en la página 2", async () => {
    const pageOne = Array.from({ length: 50 }, (_, index) =>
      song(`page1-${index}`),
    );
    const loadPage = vi.fn(async (offset: number) =>
      offset === 0 ? pageOne : [song("target")],
    );
    renderPlayer();

    await act(async () => {
      getPlayer().play(song("target"), {
        label: "album",
        loadPage,
        total: 51,
      });
    });

    await waitFor(() => expect(getPlayer().current?.id).toBe("target"));
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(getPlayer().queue).toHaveLength(51);
  });

  it("onEnded en el borde extiende el contexto y sigue reproduciendo", async () => {
    const loadPage = vi.fn().mockResolvedValue([song("2")]);
    renderPlayer();

    await act(async () => {
      getPlayer().play(song("1"), { label: "ctx", seed: [song("1")], loadPage });
    });
    expect(getPlayer().playing).toBe(true);

    await act(async () => {
      lastAudio().emit("ended");
    });

    await waitFor(() => expect(getPlayer().current?.id).toBe("2"));
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(getPlayer().playing).toBe(true);
  });

  it("onEnded sin más canciones (cola fija) detiene la reproducción", async () => {
    // Mock explícito: la cadena de radio es estéril (no un fallo de red).
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(song("1"), [song("1")]);
    });
    expect(getPlayer().playing).toBe(true);

    await act(async () => {
      lastAudio().emit("ended");
    });

    expect(getPlayer().current?.id).toBe("1");
    expect(getPlayer().playing).toBe(false);
  });

  it("cola anclada: suena la canción ya y el top del artista se prefetchea sin duplicarla", async () => {
    const anchor = song("seed");
    getSongsMock.mockResolvedValue({
      // El top del artista INCLUYE la canción anclada (caso normal).
      items: [anchor, song("top-1"), song("top-2")],
      total: 3,
      offset: 0,
      limit: 51,
    });
    renderPlayer();

    await act(async () => {
      getPlayer().play(anchor, songAnchoredContext({ song: anchor }));
    });

    // Arranca con la semilla: audio ya cargado, sin esperar el fetch.
    expect(getPlayer().contextLabel).toBe("Radio de Artista");
    expect(getPlayer().contextKey).toBe(`radio:${anchor.artist.id}:${anchor.id}`);
    expect(getPlayer().current?.id).toBe("seed");

    // El prefetch trae el top del artista solo, sin pulsar next.
    await waitFor(() =>
      expect(getPlayer().queue.map((item) => item.id)).toEqual([
        "seed",
        "top-1",
        "top-2",
      ]),
    );
    expect(getSongsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: anchor.artist.id,
        sort: "plays",
        offset: 0,
        limit: 51,
      }),
    );
    // Dedupe: la semilla venía en el top y no se repite en la cola.
    expect(new Set(getPlayer().queue.map((item) => item.id)).size).toBe(3);

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("top-1");
  });

  it("cola anclada: un fallo de red en la radio deja la semilla y el next sigue posible", async () => {
    const anchor = song("seed");
    getSongsMock.mockRejectedValue(new Error("boom"));
    renderPlayer();

    await act(async () => {
      getPlayer().play(anchor, songAnchoredContext({ song: anchor }));
    });
    await act(async () => getPlayer().next());

    // Fallan la página anclada y el pull de la radio (2 fetches), pero un fallo
    // de RED no es esterilidad: la cola queda en la semilla y `hasNext` sigue
    // true — el próximo next reintenta el encadenado.
    await waitFor(() =>
      expect(getSongsMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    expect(getPlayer().hasNext).toBe(true);
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["seed"]);
    expect(getPlayer().current?.id).toBe("seed");

    // La red vuelve pero la radio no tiene nada nuevo: recién ahí la cadena es
    // estéril y se detiene de verdad (la semilla sigue sonando).
    getSongsMock.mockResolvedValue(pageOf([]));
    await act(async () => getPlayer().next());
    expect(getPlayer().hasNext).toBe(false);
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["seed"]);
    expect(getPlayer().current?.id).toBe("seed");
  });

  // --- Q4: radio encadenada al agotar la cola (autoplay tipo Spotify) ------

  it("Q4: array finito agotado encadena la radio con exclusiones", async () => {
    const a1 = song("a1");
    const a2 = song("a2");
    const fresh = song("b-new");
    const b2 = song("b2");
    // El artista tiene 4 canciones y la radio las sirve en UN solo pull (su
    // cursor es interno: no paginan el offset del motor), así que b-new y b2
    // llegan juntos. Antes el mock repetía [a1, a2, b-new] sin importar el
    // offset: tras el next el dedupe dejaba la radio estéril (comportamiento
    // correcto, cubierto por "prefetch: un pull vacío sin error…").
    const byArtist: typeof songsService.getSongs = (params) =>
      params?.artistId
        ? Promise.resolve(pageOf([a1, a2, fresh, b2], 4))
        : Promise.resolve(pageOf([]));
    getSongsMock.mockImplementation(byArtist);
    renderPlayer();

    await act(async () => {
      getPlayer().play(a2, [a1, a2]);
    });
    expect(getPlayer().contextLabel).toBeNull();

    // Siguiente al final del array: encadena "Radio de Artista" y salta al
    // primer item NUEVO (a1/a2 ya reproducidas quedaron excluidas).
    await act(async () => getPlayer().next());
    expect(getPlayer().contextLabel).toBe("Radio de Artista");
    expect(getPlayer().current?.id).toBe("b-new");
    // Queda b2 por delante ⇒ hay siguiente. (El encadenado desde la ÚLTIMA
    // canción vuelve estéril porque el mismo catálogo ya está todo excluido,
    // pero eso no deshabilita el next mientras haya material.)
    expect(getPlayer().queue.map((item) => item.id)).toEqual([
      "a1",
      "a2",
      "b-new",
      "b2",
    ]);
    expect(getPlayer().hasNext).toBe(true);
  });

  it("Q4: contexto finito agotado también encadena", async () => {
    const a1 = song("a1");
    const fresh = song("b-new");
    const byArtistFinite: typeof songsService.getSongs = (params) =>
      params?.artistId
        ? Promise.resolve(pageOf([a1, fresh], 2))
        : Promise.resolve(pageOf([]));
    getSongsMock.mockImplementation(byArtistFinite);
    const finiteContext: PlayContext = {
      label: "Populares ahora",
      seed: [a1],
      total: 1,
    };
    renderPlayer();

    await act(async () => {
      getPlayer().play(a1, finiteContext);
    });
    await act(async () => getPlayer().next());
    expect(getPlayer().contextLabel).toBe("Radio de Artista");
    expect(getPlayer().current?.id).toBe("b-new");
  });

  it("Q4: la radio cae a los géneros cuando el artista se seca", async () => {
    const a1 = song("a1");
    a1.genres = ["rock"];
    const genreMate = song("g-new");
    const bySource: typeof songsService.getSongs = (params) => {
      if (params?.artistId) {
        return Promise.resolve(pageOf([a1], 1));
      }
      if (params?.genre === "rock") {
        return Promise.resolve(pageOf([a1, genreMate], 2));
      }
      return Promise.resolve(pageOf([]));
    };
    getSongsMock.mockImplementation(bySource);
    renderPlayer();

    await act(async () => {
      getPlayer().play(a1, [a1]);
    });
    await act(async () => getPlayer().next());
    // a1 ya está reproducida: la radio pasa al compañero de género.
    expect(getPlayer().current?.id).toBe("g-new");
    expect(getPlayer().contextLabel).toBe("Radio de Artista");
  });

  it("Q4: cadena estéril detiene de verdad y no reintenta en loop", async () => {
    const a1 = song("a1");
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(a1, [a1]);
    });
    // El prefetch ya encadenó y el pull vacío (sin error) es esterilidad real:
    // se latchea al toque, así que la Cola muestra el fin, no el skeleton.
    await waitFor(() => expect(getPlayer().hasNext).toBe(false));

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("a1");
    expect(getPlayer().hasNext).toBe(false);

    // Sin cadena estéril no se vuelve a fetchar (flag anti-loop).
    const calls = getSongsMock.mock.calls.length;
    await act(async () => getPlayer().next());
    expect(getSongsMock.mock.calls.length).toBe(calls);
    expect(getPlayer().current?.id).toBe("a1");
  });

  it("Q4: prev tras encadenar vuelve al contexto original", async () => {
    const a1 = song("a1");
    const fresh = song("b-new");
    const byArtistPrev: typeof songsService.getSongs = (params) =>
      params?.artistId
        ? Promise.resolve(pageOf([fresh], 1))
        : Promise.resolve(pageOf([]));
    getSongsMock.mockImplementation(byArtistPrev);
    renderPlayer();

    await act(async () => {
      getPlayer().play(a1, [a1]);
    });
    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("b-new");

    await act(async () => getPlayer().prev());
    expect(getPlayer().current?.id).toBe("a1");
    expect(getPlayer().contextLabel).toBe("Radio de Artista");
  });

  // --- F2: salto dentro de la cola (click en la tab Cola) ------------------

  it("jumpTo salta dentro de la cola sin perder el contexto", async () => {
    const items = [song("1"), song("2"), song("3")];
    // La radio del prefetch es estéril: no agrega material ajeno a la cola.
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(items[0], { label: "ctx", seed: items, total: 3 });
    });

    await act(async () => getPlayer().jumpTo("3"));

    expect(getPlayer().current?.id).toBe("3");
    expect(getPlayer().playing).toBe(true);
    // Contexto y cola intactos: no re-fetchea ni re-arma nada.
    expect(getPlayer().contextLabel).toBe("ctx");
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["1", "2", "3"]);

    // El índice es global: prev camina la misma cola.
    await act(async () => getPlayer().prev());
    expect(getPlayer().current?.id).toBe("2");
  });

  it("jumpTo con un id fuera de la cola no hace nada", async () => {
    const items = [song("1"), song("2")];
    // La radio del prefetch es estéril: no agrega material ajeno a la cola.
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(items[0], { label: "ctx", seed: items, total: 2 });
    });

    await act(async () => getPlayer().jumpTo("missing"));

    expect(getPlayer().current?.id).toBe("1");
    expect(getPlayer().queue).toHaveLength(2);
  });

  // --- Prefetch anticipado + historial (cola que se regenera sola) ---------

  it("prefetch: en la última canción la cola se regenera sola, sin pulsar next", async () => {
    const a1 = song("a1");
    const a2 = song("a2");
    const fresh = song("b-new");
    getSongsMock.mockResolvedValue(pageOf([fresh], 1));
    renderPlayer();

    await act(async () => {
      getPlayer().play(a2, [a1, a2]);
    });

    // Suena la ÚLTIMA: el prefetch ya encadenó la radio y agregó material.
    await waitFor(() =>
      expect(getPlayer().queue.map((item) => item.id)).toEqual([
        "a1",
        "a2",
        "b-new",
      ]),
    );
    // No movió la canción: el cambio lo hace el usuario o el `onEnded`.
    expect(getPlayer().current?.id).toBe("a2");
    expect(getPlayer().playing).toBe(true);
    expect(getPlayer().hasNext).toBe(true);
  });

  it("prefetch: no refetchea mientras hay colchón por delante", async () => {
    const seed = [song("1"), song("2"), song("3"), song("4")];
    const loadPage = vi.fn().mockResolvedValue([song("5"), song("6")]);
    renderPlayer();

    await act(async () => {
      getPlayer().play(seed[0], { label: "ctx", seed, loadPage, total: 10 });
    });
    // 3 canciones por delante: no se pide nada todavía.
    expect(loadPage).not.toHaveBeenCalled();

    act(() => getPlayer().next()); // quedan 2: tampoco
    expect(loadPage).not.toHaveBeenCalled();

    act(() => getPlayer().next()); // queda 1: recién ahí prefetchea
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    expect(getPlayer().current?.id).toBe("3");
  });

  it("playedIds marca sólo lo que empezó a sonar (historial)", async () => {
    const seed = [song("1"), song("2"), song("3")];
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(seed[0], { label: "ctx", seed, total: 3 });
    });
    expect([...getPlayer().playedIds]).toEqual(["1"]);

    // Saltar a una fila de la cola arranca esa canción y la marca.
    await act(async () => getPlayer().jumpTo("3"));
    expect([...getPlayer().playedIds].sort()).toEqual(["1", "3"]);

    // Estar materializada NO alcanza: "2" todavía no sonó.
    expect(getPlayer().queue.map((item) => item.id)).toContain("2");
    expect(getPlayer().playedIds.has("2")).toBe(false);

    await act(async () => getPlayer().prev());
    expect([...getPlayer().playedIds].sort()).toEqual(["1", "2", "3"]);
  });

  it("prefetch: un pull vacío sin error marca la cadena estéril (sin skeleton eterno)", async () => {
    const a1 = song("a1");
    getSongsMock.mockResolvedValue(pageOf([]));
    renderPlayer();

    await act(async () => {
      getPlayer().play(a1, [a1]);
    });

    // El pull de la radio vuelve vacío SIN error: esterilidad real (no un fallo
    // reintentable) → `hasNext` false. Sin el latch del prefetch el efecto no
    // se re-dispara (deps `current`/`queue.length`/`chainFailed`) y la Cola
    // quedaría en skeleton para siempre hasta el `onEnded`.
    await waitFor(() => expect(getPlayer().hasNext).toBe(false));
    expect(getPlayer().prefetchFailed).toBe(false);
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["a1"]);
    expect(getPlayer().current?.id).toBe("a1");
  });

  // --- Persistencia de sesión (sessionStorage, F5) -------------------------

  it("restaura cola, actual y posición pausada, sin autoplay ni listen", async () => {
    const restored = [song("r1"), song("r2"), song("r3")];
    sessionStorage.setItem(
      PLAYER_SESSION_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        currentId: "r2",
        queue: restored.map((item) => ({ ...item, lyrics: null })),
        progress: 42,
        duration: 200,
        contextLabel: "Playlist: Persistida",
        playedIds: ["r1"],
      })
    );
    // La cola restaurada es fija: el prefetch encadena la radio y no agrega nada.
    getSongsMock.mockResolvedValue(pageOf([]));

    await act(async () => {
      renderPlayer();
    });

    expect(getPlayer().current?.id).toBe("r2");
    expect(getPlayer().queue.map((item) => item.id)).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
    expect(getPlayer().progress).toBe(42);
    expect(getPlayer().playing).toBe(false);
    expect(getPlayer().contextLabel).toBe("Playlist: Persistida");
    // El historial vuelve y la actual se marca (ya "empezó" en esta sesión).
    expect([...getPlayer().playedIds].sort()).toEqual(["r1", "r2"]);
    // Audio cargado pero quieto: sin play() y sin POST de listen.
    expect(lastAudio().src).toBe("https://cdn.test/r2.mp3");
    expect(lastAudio().playCalls).toBe(0);
    expect(recordPlayMock).not.toHaveBeenCalled();

    // El primer play aplica el segundo guardado y recién ahí suena.
    await act(async () => {
      getPlayer().toggle();
    });
    expect(lastAudio().currentTime).toBe(42);
    expect(lastAudio().playCalls).toBe(1);
  });

  it("un blob inválido (JSON roto o versión vieja) se descarta al montar", async () => {
    const invalidPayloads = [
      "{not-json",
      JSON.stringify({ v: 0, queue: [song("x")], currentId: "x" }),
    ];

    for (const raw of invalidPayloads) {
      cleanup();
      capturedRef.current = null;
      FakeAudio.instances = [];
      sessionStorage.setItem(PLAYER_SESSION_KEY, raw);

      await act(async () => {
        renderPlayer();
      });

      expect(getPlayer().current).toBeNull();
      expect(getPlayer().queue).toHaveLength(0);
      expect(sessionStorage.getItem(PLAYER_SESSION_KEY)).toBeNull();
    }
  });
});
