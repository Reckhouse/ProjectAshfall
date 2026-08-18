"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Direction, PlayerSnapshot, TerrainKind } from "@/game/domain/types";
import type { VisibleWorldView } from "@/game/services/chunks";
import { balanceV1 } from "@/game/config/balance.v1";
import { chunkCoord, decodeTerrainKind } from "@/game/world/chunks";
import { directionBetween } from "@/game/world/directions";
import { pickGatherCave } from "@/game/world/caves";
import { baseUpgradeMetalCost, pickGatherNode } from "@/game/world/nodes";
import { LogoutButton } from "@/components/game/LogoutButton";

type CommandResponse = {
  ok: boolean;
  code?: string;
  message?: string;
  player?: PlayerSnapshot;
  collected?: { resource: "ENERGY" | "METAL"; amount: number };
  upgrade?: { level: number; metalSpent: number };
  cave?: { id: string; tier: number };
  tool?: { affinity: "ENERGY" | "METAL"; tier: number; bonusBps: number; equipped: boolean };
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

function terrainAt(view: VisibleWorldView | null, x: number, y: number): TerrainKind | null {
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

export function GameShell({
  player: initialPlayer,
  initialView,
}: {
  player: PlayerSnapshot;
  initialView: VisibleWorldView | null;
}) {
  const [player, setPlayer] = useState(initialPlayer);
  const [view, setView] = useState<VisibleWorldView | null>(initialView);
  const [feedback, setFeedback] = useState("Command channel open.");
  const [pending, setPending] = useState(false);
  const lastCommandAt = useRef(0);
  const pendingRef = useRef(false);
  const queuedDirection = useRef<Direction | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const location = player.location;
  const onOwnBase =
    Boolean(player.base && location && player.base.x === location.x && player.base.y === location.y);

  const viewCoversViewport = useCallback((snapshot: PlayerSnapshot, current: VisibleWorldView | null) => {
    if (!snapshot.location || !current) {
      return false;
    }
    const radius = balanceV1.movement.viewportRadius;
    for (const [dx, dy] of [
      [-radius, -radius],
      [radius, -radius],
      [-radius, radius],
      [radius, radius],
      [0, 0],
    ] as const) {
      if (!terrainAt(current, snapshot.location.x + dx, snapshot.location.y + dy)) {
        return false;
      }
    }
    return true;
  }, []);

  const loadChunks = useCallback(async (snapshot: PlayerSnapshot, force = false) => {
    if (!snapshot.location) {
      return;
    }
    if (!force && viewCoversViewport(snapshot, viewRef.current)) {
      return;
    }
    const cx = chunkCoord(snapshot.location.x);
    const cy = chunkCoord(snapshot.location.y);
    const response = await fetch(`/api/game/world/chunks?cx=${cx}&cy=${cy}&radius=1`);
    const data = (await response.json()) as VisibleWorldView & CommandResponse;
    if (!response.ok || data.ok === false) {
      setFeedback(data.message ?? "Unable to load the surrounding grid.");
      return;
    }
    setView(data);
  }, [viewCoversViewport]);

  const sendCommand = useCallback(async (
    path: string,
    body: object,
    options?: { refreshChunks?: "ifNeeded" | "always" },
  ): Promise<CommandResponse | null> => {
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
      const refresh = options?.refreshChunks ?? "ifNeeded";
      void loadChunks(data.player, refresh === "always");
      return data;
    } catch {
      setFeedback("Command channel failed.");
      return null;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [loadChunks]);

  const move = useCallback(
    async (direction: Direction) => {
      if (pendingRef.current) {
        queuedDirection.current = direction;
        return;
      }
      const next = await sendCommand("/api/game/move", {
        actionId: newActionId(),
        payload: { direction },
      });
      if (next?.player?.location) {
        const returned = next.player.location.type === "BASE";
        setFeedback(returned ? "Returned to base." : `Moved ${direction}.`);
      }
      const queued = queuedDirection.current;
      queuedDirection.current = null;
      if (queued) {
        await move(queued);
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

  const collectNode = useCallback(
    async (nodeId: string) => {
      const next = await sendCommand("/api/game/collect", {
        actionId: newActionId(),
        payload: { nodeId },
      }, { refreshChunks: "always" });
      if (next?.collected) {
        setFeedback(`Collected ${next.collected.amount} ${next.collected.resource}.`);
        setView((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            nodes: current.nodes.map((entry) =>
              entry.id === nodeId ? { ...entry, remaining: 0 } : entry,
            ),
          };
        });
      }
    },
    [sendCommand],
  );

  const gatherNearest = useCallback(async () => {
    if (!location) {
      setFeedback("No field location to gather from.");
      return;
    }
    const node = pickGatherNode(view?.nodes ?? [], location, balanceV1.economy.nodes.collectChebyshevRange);
    if (!node) {
      setFeedback("Move adjacent to an E or M node, then press G to gather.");
      return;
    }
    await collectNode(node.id);
  }, [collectNode, location, view?.nodes]);

  const clearCave = useCallback(
    async (caveId: string) => {
      const next = await sendCommand("/api/game/clear-cave", {
        actionId: newActionId(),
        payload: { caveId },
      }, { refreshChunks: "always" });
      if (next?.tool) {
        const slot = next.tool.affinity === "ENERGY" ? "Energy" : "Metal";
        setFeedback(
          next.tool.equipped
            ? `Cleared a cave. Equipped a T${next.tool.tier} ${slot} tool.`
            : `Cleared a cave. Stored a T${next.tool.tier} ${slot} tool.`,
        );
        setView((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            caves: (current.caves ?? []).map((entry) => (entry.id === caveId ? { ...entry, cleared: true } : entry)),
          };
        });
      }
    },
    [sendCommand],
  );

  const clearNearestCave = useCallback(async () => {
    if (!location) {
      setFeedback("No field location to clear a cave from.");
      return;
    }
    const cave = pickGatherCave(view?.caves ?? [], location, balanceV1.economy.caves.collectChebyshevRange);
    if (!cave) {
      setFeedback("Move adjacent to a cave (C), then press C to clear it.");
      return;
    }
    await clearCave(cave.id);
  }, [clearCave, location, view?.caves]);

  const upgradeBase = useCallback(async () => {
    const next = await sendCommand("/api/game/upgrade-base", { actionId: newActionId() });
    if (next?.upgrade) {
      setFeedback(`Base upgraded to level ${next.upgrade.level}.`);
    }
  }, [sendCommand]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        if (!event.repeat) {
          void gatherNearest();
        }
        return;
      }
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        if (!event.repeat) {
          void clearNearestCave();
        }
        return;
      }
      const direction = KEY_TO_DIRECTION[event.key];
      if (!direction) {
        return;
      }
      event.preventDefault();
      void move(direction);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearNearestCave, gatherNearest, move]);

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
        const node = view?.nodes.find((entry) => entry.x === x && entry.y === y && entry.remaining > 0) ?? null;
        const cave = view?.caves?.find((entry) => entry.x === x && entry.y === y && !entry.cleared) ?? null;
        const interactRange = Math.max(Math.abs(dx), Math.abs(dy)) <= balanceV1.economy.nodes.collectChebyshevRange;
        cells.push({
          x,
          y,
          dx,
          dy,
          kind,
          adjacent,
          ownBase,
          otherBase,
          passable,
          isPlayer: dx === 0 && dy === 0,
          node,
          cave,
          collectRange: interactRange,
        });
      }
    }
    return cells;
  }, [location, player.base, radius, view]);

  async function onTileClick(tile: (typeof tiles)[number]) {
    if (tile.node && tile.collectRange) {
      await collectNode(tile.node.id);
      return;
    }
    if (tile.cave && tile.collectRange) {
      await clearCave(tile.cave.id);
      return;
    }
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
          <StatusRow
            label="Production"
            value={
              player.resources
                ? `${player.resources.energyPerHour}/h E · ${player.resources.metalPerHour}/h M`
                : "—"
            }
          />
          <StatusRow label="Base level" value={player.base ? String(player.base.level) : "—"} testId="base-level" />
          <StatusRow
            label="Energy tool"
            value={formatTool(player.tools?.energy ?? null)}
            tone="energy"
            testId="energy-tool"
          />
          <StatusRow
            label="Metal tool"
            value={formatTool(player.tools?.metal ?? null)}
            tone="metal"
            testId="metal-tool"
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
            {location?.type === "BASE" &&
            player.base &&
            player.base.level < balanceV1.economy.upgrades.base.maxLevel ? (
              <button
                type="button"
                data-testid="upgrade-base"
                onClick={() => void upgradeBase()}
                disabled={
                  pending ||
                  (player.resources?.metal ?? 0) < (baseUpgradeMetalCost(player.base.level) ?? Number.POSITIVE_INFINITY)
                }
                className="min-h-11 border border-[var(--ash-metal)] px-3 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
              >
                Upgrade base · {baseUpgradeMetalCost(player.base.level)} Metal
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
            <button
              type="button"
              data-testid="gather-node"
              onClick={() => void gatherNearest()}
              disabled={pending || !location}
              className="min-h-11 border border-[var(--ash-energy)] px-3 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
            >
              Gather · G
            </button>
            <button
              type="button"
              data-testid="clear-cave"
              onClick={() => void clearNearestCave()}
              disabled={pending || !location}
              className="min-h-11 border border-[var(--ash-olive)] px-3 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
            >
              Clear cave · C
            </button>
          </div>
        </aside>

        <section className="ash-frame p-4" aria-label="World grid">
          <p className="ash-label mb-3">Local grid · WASD / arrows move · G gathers · C clears caves</p>
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
                tile.node ? "ash-tile-node" : "",
                tile.cave ? "ash-tile-cave" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const label = `${tile.x}, ${tile.y}${tile.kind ? ` ${tile.kind}` : " unknown"}${tile.node ? ` ${tile.node.resourceType}` : ""}${tile.cave ? " cave" : ""}`;
              const clickable = Boolean(tile.adjacent || (tile.node && tile.collectRange) || (tile.cave && tile.collectRange));
              return (
                <button
                  key={`${tile.x}:${tile.y}`}
                  type="button"
                  role="gridcell"
                  className={className}
                  aria-label={label}
                  aria-current={tile.isPlayer ? "true" : undefined}
                  disabled={!clickable}
                  data-world-x={tile.x}
                  data-world-y={tile.y}
                  data-adjacent={tile.adjacent ? "true" : "false"}
                  data-passable={tile.passable ? "true" : "false"}
                  data-own-base={tile.ownBase ? "true" : "false"}
                  data-player={tile.isPlayer ? "true" : "false"}
                  data-node-id={tile.node?.id}
                  data-node-type={tile.node?.resourceType}
                  data-cave-id={tile.cave?.id}
                  onClick={() => void onTileClick(tile)}
                >
                  {tile.isPlayer
                    ? "●"
                    : tile.node
                      ? tile.node.resourceType === "ENERGY"
                        ? "E"
                        : "M"
                      : tile.cave
                        ? "C"
                        : tile.ownBase
                          ? "⌂"
                          : ""}
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

function formatTool(tool: { tier: number; bonusBps: number } | null): string {
  if (!tool) {
    return "NONE";
  }
  return `T${tool.tier} +${Math.round(tool.bonusBps / 100)}%`;
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
