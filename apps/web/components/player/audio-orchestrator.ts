/**
 * Orquestador de audio de toda la app.
 *
 * Garantiza que solo suene UNA fuente a la vez: el reproductor global
 * (PlayerProvider) y los previews del panel compiten por el "turno" vía
 * claimAudio()/releaseAudio(). Empezar una fuente pausa la anterior, así el
 * visualizer / ecualizador solo se muestra en la ventana que realmente suena.
 */

export interface AudioHandle {
  /** Pausa esta fuente (el turno se libera solo cuando se dispara su pausa). */
  pause: () => void;
}

let active: AudioHandle | null = null;

/** Pausa la fuente actual (si existe) y deja el turno al nuevo dueño. */
export function claimAudio(next: AudioHandle): void {
  if (active && active !== next) {
    try {
      active.pause();
    } catch {
      // El elemento pudo ser destruido; el turno se mueve igual.
    }
  }
  active = next;
}

/** Libera el turno si lo tenía (permite que otra fuente pueda sonar). */
export function releaseAudio(handle: AudioHandle): void {
  if (active === handle) active = null;
}