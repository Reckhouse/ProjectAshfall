"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Direction, PlayerSnapshot, TerrainKind } from "@/game/domain/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { chunkCoord, decodeTerrainKind } from "@/game/world/chunks";
import { directionBetween } from "@/game/world/directions";
import { LogoutButton } from "@/components/game/LogoutButton";

type ChunkDto = {
  chunkX: number;
  chunkY: number;
  size: number;
  originX: number;
  originY: number;
  terrain: number[];
};

type WorldViewDto = {
  world: string;
  chunkSize: number;
  player: {
    x: number | null;
    y: number | null;
    locationType: string;
    chunkX: number;
    chunkY: number;
  };
  chunks: ChunkDto[];
  bases: Array<{ x: number; y: number; owned: boolean }>;
};

type CommandResponse = {
  ok: boolean;
  code?: string;
  message?: string;
  player?: PlayerSnapshot;
};

const TERRAIN_CLASS: Record<TerrainKind, string> = {
  plains: "ash-tile-plains",
  ash: "ash-tile-ash",
  rock: "ash-tile-rock",
  ruin: "ash-tile-ruin",
};

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "north",
  w: "north",
  W: "north",
  ArrowDown: "south",
  s: "south",
  S: "south",
  ArrowLeft: "west",
  a: "west",
  A: "west",
  ArrowRight: "east",
  d: "east",
  D: "east",
};

function newActionId(): string {
  return crypto.randomUUID();
}

function terrainAt(view: WorldViewDto | null, x: number, y: number): TerrainKind | null {
  if (!view) {
    return null;
  }
  for (const chunk of view.chunks) {
    if (x < chunk.originX || y < chunk.originY || x >= chunk.originX + chunk.size || y >= chunk.originY + chunk.size) {
      continue;
    }
    const localX = x - chunk.originX;
    const localY = y - chunk.originY;
    return decodeTerrainKind(chunk.terrain[localY * chunk.size + localX] ?? 2);
  }
  return null;
}

export function GameShell({ player: initialPlayer }: { player: PlayerSnapshot }) {
  const [player, setPlayer] = useState(initialPlayer);
  const [view, setView] = useState<WorldViewDto | null>(null);
  const [feedback, setFeedback] = useState("Command channel open.");
  const [pending, setPending] = useState(false);
  const lastCommandAt = useRef(0);
  const pendingRef = useRef(false);

  const location = player.location;
  const onOwnBase =
    Boolean(player.base && location && player.base.x === location.x && player.base.y === location.y);

  const loadChunks = useCallback(async (snapshot: PlayerSnapshot) => {
    if (!snapshot.location) {
      return;
    }
    const cx = chunkCoord(snapshot.location.x);
    const cy = chunkCoord(snapshot.location.y);
    const response = await fetch(`/api/game/world/chunks?cx=${cx}&cy=${cy}&radius=1`);
    const data = (await response.json()) as WorldViewDto & CommandResponse;
    if (!response.ok || data.ok === false) {
      setFeedback(data.message ?? "Unable to load the surrounding grid.");
      return;
    }
    setView(data);
  }, []);

  useEffect(() => {
    void loadChunks(player);
  }, [loadChunks, player]);

  const sendCommand = useCallback(async (path: string, body: object): Promise<PlayerSnapshot | null> => {
    if (pendingRef.current) {
      return null;
    }
    const waitMs = balanceV1.movement.minIntervalMs - (Date.now() - lastCommandAt.current);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (pendingRef.current) {
        return null;
      }
    }
    pendingRef.current = true;
    lastCommandAt.current = Date.now();
    setPending(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as CommandResponse;
      if (!data.ok || !data.player) {
        setFeedback(data.message ?? "Command rejected.");
        return null;
      }
      setPlayer(data.player);
      return data.player;
    } catch {
      setFeedback("Command channel failed.");
      return null;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  const move = useCallback(
    async (direction: Direction) => {
      const next = await sendCommand("/api/game/move", {
        actionId: newActionId(),
        payload: { direction },
      });
      if (next?.location) {
        const returned = next.location.type === "BASE";
        setFeedback(returned ? "Returned to base." : `Moved ${direction}.`);
      }
    },
    [sendCommand],
  );

  const leaveBase = useCallback(async () => {
    const next = await sendCommand("/api/game/depart", { actionId: newActionId() });
    if (next) {
      setFeedback("Left base. The field is live.");
    }
  }, [sendCommand]);

  const enterBase = useCallback(async () => {
    const next = await sendCommand("/api/game/enter-base", { actionId: newActionId() });
    if (next) {
      setFeedback("Entered base.");
    }
  }, [sendCommand]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const direction = KEY_TO_DIRECTION[event.key];
      if (!direction) {
        return;
      }
      event.preventDefault();
      void move(direction);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  const radius = balanceV1.movement.viewportRadius;
  const tiles = useMemo(() => {
    if (!location) {
      return [];
    }
    const cells = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = location.x + dx;
        const y = location.y + dy;
        const kind = terrainAt(view, x, y);
        const adjacent = directionBetween(location, { x, y });
        const ownBase = Boolean(player.base && player.base.x === x && player.base.y === y);
        const otherBase = Boolean(view?.bases.some((base) => base.x === x && base.y === y && !base.owned));
        const passable = kind === "plains" || kind === "ash";
        cells.push({ x, y, dx, dy, kind, adjacent, ownBase, otherBase, passable, isPlayer: dx === 0 && dy === 0 });
      }
    }
    return cells;
  }, [location, player.base, radius, view]);

  async function onTileClick(tile: (typeof tiles)[number]) {
    if (!tile.adjacent) {
      return;
    }
    await move(tile.adjacent);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ash-border)] pb-4">
        <div>
          <p className="ash-label">Command shell</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--ash-beige)]">PROJECT ASHFALL</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="ash-frame space-y-4 p-5" aria-label="Base status">
          <StatusRow label="Base status" value={player.base ? "ESTABLISHED" : "PENDING"} />
          <StatusRow label="World" value={(player.world ?? "UNKNOWN").toUpperCase()} />
          <StatusRow
            label="Base"
            value={player.base ? `${player.base.x}, ${player.base.y}` : "UNASSIGNED"}
            testId="base-coord"
          />
          <StatusRow
            label="Coordinate"
            value={location ? `${location.x}, ${location.y}` : "UNASSIGNED"}
            testId="player-coord"
          />
          <StatusRow
            label="Location"
            value={location?.type ?? "UNKNOWN"}
            testId="location-type"
          />
          <StatusRow
            label="Energy"
            value={player.resources ? String(player.resources.energy) : "—"}
            tone="energy"
          />
          <StatusRow
            label="Metal"
            value={player.resources ? String(player.resources.metal) : "—"}
            tone="metal"
          />
          <div className="flex flex-col gap-2 pt-2">
            {location?.type === "BASE" ? (
              <button
                type="button"
                data-testid="leave-base"
                onClick={() => void leaveBase()}
                disabled={pending}
                className="min-h-11 border border-[var(--ash-rust)] px-3 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
              >
                Leave base
              </button>
            ) : null}
            {location?.type === "FIELD" && onOwnBase ? (
              <button
                type="button"
                data-testid="enter-base"
                onClick={() => void enterBase()}
                disabled={pending}
                className="min-h-11 border border-[var(--ash-olive)] px-3 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
              >
                Enter base
              </button>
            ) : null}
          </div>
        </aside>

        <section className="ash-frame p-4" aria-label="World grid">
          <p className="ash-label mb-3">Local grid · WASD / arrows · click adjacent tile</p>
          <div
            className="ash-world-grid"
            role="grid"
            data-testid="world-grid"
            style={{ gridTemplateColumns: `repeat(${radius * 2 + 1}, minmax(1.5rem, 1fr))` }}
          >
            {tiles.map((tile) => {
              const className = [
                "ash-tile",
                tile.kind ? TERRAIN_CLASS[tile.kind] : "ash-tile-void",
                tile.isPlayer ? "ash-tile-player" : "",
                tile.ownBase ? "ash-tile-own-base" : "",
                tile.otherBase ? "ash-tile-other-base" : "",
                tile.adjacent ? "ash-tile-adjacent" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const label = `${tile.x}, ${tile.y}${tile.kind ? ` ${tile.kind}` : " unknown"}`;
              return (
                <button
                  key={`${tile.x}:${tile.y}`}
                  type="button"
                  role="gridcell"
                  className={className}
                  aria-label={label}
                  aria-current={tile.isPlayer ? "true" : undefined}
                  disabled={pending || !tile.adjacent}
                  data-world-x={tile.x}
                  data-world-y={tile.y}
                  data-adjacent={tile.adjacent ? "true" : "false"}
                  data-passable={tile.passable ? "true" : "false"}
                  data-own-base={tile.ownBase ? "true" : "false"}
                  data-player={tile.isPlayer ? "true" : "false"}
                  onClick={() => void onTileClick(tile)}
                >
                  {tile.isPlayer ? "●" : tile.ownBase ? "⌂" : ""}
                </button>
              );
            })}
          </div>
          <p className="mt-4 min-h-6 text-sm text-[var(--ash-beige)]" data-testid="command-feedback" aria-live="polite">
            {feedback}
          </p>
        </section>
      </section>
    </main>
  );
}

function StatusRow({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "energy" | "metal";
  testId?: string;
}) {
  const valueClass =
    tone === "energy"
      ? "text-[var(--ash-energy)]"
      : tone === "metal"
        ? "text-[var(--ash-metal)]"
        : "text-[var(--ash-text)]";

  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-[var(--ash-border)]/60 pb-3">
      <span className="ash-label">{label}</span>
      <span className={`ash-value ${valueClass}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
