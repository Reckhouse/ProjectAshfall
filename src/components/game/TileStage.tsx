"use client";

import Image from "next/image";
import { TILE_ART, type TileArtId } from "@/game/ui/tile-art";

export function TileStage({
  art,
  heading,
  detail,
  result,
}: {
  art: TileArtId;
  heading: string;
  detail: string;
  result: string;
}) {
  const meta = TILE_ART[art];

  return (
    <section className="ash-frame flex min-h-0 flex-col p-4" aria-label="Active tile">
      <p className="ash-label mb-3">Active tile</p>
      <div className="ash-tile-stage" data-testid="tile-stage">
        <Image
          key={meta.src}
          src={meta.src}
          alt={meta.alt}
          fill
          priority
          sizes="(min-width: 1024px) 42vw, 100vw"
          className="object-cover"
        />
        <div className="ash-tile-stage-caption">
          <h2 className="text-2xl font-semibold text-[var(--ash-beige)]">{heading}</h2>
          <p className="mt-1 font-mono text-sm text-[var(--ash-muted)]">{detail}</p>
        </div>
      </div>
      <p
        className="mt-4 min-h-6 text-sm text-[var(--ash-beige)]"
        data-testid="command-feedback"
        aria-live="polite"
      >
        {result}
      </p>
    </section>
  );
}
