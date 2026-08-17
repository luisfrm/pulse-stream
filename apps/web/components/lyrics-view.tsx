interface LyricsViewProps {
  lyrics: string | null;
}

/**
 * Vista de letras estática (estilo Spotify sin sincronización):
 * texto completo, tipografía grande, sin resaltado por tiempo.
 */
export function LyricsView({ lyrics }: LyricsViewProps) {
  if (!lyrics || lyrics.trim() === "") {
    return (
      <p className="text-text-subdued">
        Esta canción no tiene letra cargada todavía.
      </p>
    );
  }

  return (
    <div className="text-2xl leading-relaxed sm:text-3xl">
      <p className="whitespace-pre-line">{lyrics}</p>
    </div>
  );
}
