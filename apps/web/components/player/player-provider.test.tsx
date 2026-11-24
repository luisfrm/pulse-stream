import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { songsService } from "@/lib/services/songs-service";
import type { GetSongsParams } from "@/lib/services/songs-service";
import type { Page, Song } from "@/lib/services/types";

// La fábrica anclada habla con la API: se mockea el service (sin red).
vi.mock("@/lib/services/songs-service", () => ({
  songsService: { getSongs: vi.fn() },
}));

import { songAnchoredContext } from "./play-contexts";
import {
  PlayerProvider,
  usePlayer,
  type PlayContext,
} from "./player-provider";

const getSongsMock = vi.mocked(songsService.getSongs);

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
  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlayerProvider — cola por contexto (Q1)", () => {
  it("next() al final del seed pide UNA página, la appendea y avanza", async () => {
    const seed = [song("1"), song("2")];
    const loadPage = vi.fn().mockResolvedValue([song("3"), song("4")]);
    renderPlayer();

    await act(async () => {
      getPlayer().play(seed[0], { label: "ctx", seed, loadPage, total: 4 });
    });
    expect(getPlayer().contextLabel).toBe("ctx");
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["1", "2"]);

    act(() => getPlayer().next());
    expect(getPlayer().current?.id).toBe("2");

    await act(async () => getPlayer().next());

    expect(loadPage).toHaveBeenCalledTimes(1);
    // La página siguiente arranca donde terminó la semilla, con el tope del motor.
    expect(loadPage).toHaveBeenCalledWith(2, 50);
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["1", "2", "3", "4"]);
    expect(getPlayer().current?.id).toBe("3");
    expect(getPlayer().hasNext).toBe(true);

    act(() => getPlayer().next());
    expect(getPlayer().current?.id).toBe("4");
    // total conocido (4) y offset consumido: no queda nada por pedir DEL
    // CONTEXTO. Con la radio encadenada (Q4) siempre hay siguiente posible
    // mientras suene algo — como Spotify, el botón no se deshabilita.
    expect(getPlayer().hasNext).toBe(true);

    // El intento de encadenar no produce nada (getSongs sin configurar en
    // este test → rechaza): cadena estéril → recién ahí se detiene.
    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("4");
    expect(getPlayer().hasNext).toBe(false);
  });

  it("si la página siguiente viene vacía, se detiene sin ciclar", async () => {
    const loadPage = vi.fn().mockResolvedValue([]);
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

  it("un array (cola fija) nunca fetchea y se detiene al final", async () => {
    const items = [song("1"), song("2")];
    renderPlayer();

    await act(async () => {
      getPlayer().play(items[0], items);
    });
    expect(getPlayer().contextLabel).toBeNull();

    act(() => getPlayer().next());
    expect(getPlayer().current?.id).toBe("2");

    await act(async () => getPlayer().next());
    expect(getPlayer().current?.id).toBe("2");
    expect(getPlayer().hasNext).toBe(false);
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

  it("cola anclada: suena la canción ya y el top del artista llega después sin duplicarla", async () => {
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

    // Arranca con la semilla: sin fetch inicial y con el audio ya cargado.
    expect(getSongsMock).not.toHaveBeenCalled();
    expect(getPlayer().contextLabel).toBe("Radio de Artista");
    expect(getPlayer().contextKey).toBe(`radio:${anchor.artist.id}:${anchor.id}`);
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["seed"]);
    expect(getPlayer().current?.id).toBe("seed");
    expect(getPlayer().hasNext).toBe(true);

    // Al borde: el motor pide la página (offset 1 = después de la semilla).
    await act(async () => getPlayer().next());
    await waitFor(() =>
      expect(getPlayer().queue.map((item) => item.id)).toEqual([
        "seed",
        "top-1",
        "top-2",
      ]),
    );

    expect(getSongsMock).toHaveBeenCalledTimes(1);
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
    expect(getPlayer().current?.id).toBe("top-1");
  });

  it("cola anclada: si el fetch de la radio falla, queda la semilla sin romperse", async () => {
    const anchor = song("seed");
    getSongsMock.mockRejectedValue(new Error("boom"));
    renderPlayer();

    await act(async () => {
      getPlayer().play(anchor, songAnchoredContext({ song: anchor }));
    });
    await act(async () => getPlayer().next());

    // El catch del motor marca el contexto agotado: la cola queda en la
    // semilla, sin más next, y la canción sigue sonando (no se detiene).
    await waitFor(() => expect(getPlayer().hasNext).toBe(false));
    expect(getPlayer().queue.map((item) => item.id)).toEqual(["seed"]);
    expect(getPlayer().current?.id).toBe("seed");
  });

  // --- Q4: radio encadenada al agotar la cola (autoplay tipo Spotify) ------

  it("Q4: array finito agotado encadena la radio con exclusiones", async () => {
    const a1 = song("a1");
    const a2 = song("a2");
    const fresh = song("b-new");
    const byArtist: typeof songsService.getSongs = (params) =>
      params?.artistId
        ? Promise.resolve(pageOf([a1, a2, fresh], 3))
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
    expect(getPlayer().queue.map((item) => item.id)).toEqual([
      "a1",
      "a2",
      "b-new",
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
    // Mientras suena algo, siempre HAY siguiente posible (encadenar).
    expect(getPlayer().hasNext).toBe(true);

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
    renderPlayer();

    await act(async () => {
      getPlayer().play(items[0], { label: "ctx", seed: items, total: 2 });
    });

    await act(async () => getPlayer().jumpTo("missing"));

    expect(getPlayer().current?.id).toBe("1");
    expect(getPlayer().queue).toHaveLength(2);
  });
});
