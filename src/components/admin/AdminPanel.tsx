"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminStats } from "@/game/services/admin-stats";
import type { BotDifficulty } from "@/game/domain/types";
import { balanceV1 } from "@/game/config/balance.v1";

type ApiError = { ok: false; message?: string; code?: string };

export function AdminPanel({ initialStats }: { initialStats: AdminStats }) {
  const [stats, setStats] = useState(initialStats);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("Admin channel open.");
  const [callsign, setCallsign] = useState("");
  const [difficulty, setDifficulty] = useState<BotDifficulty>("RAIDER");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/stats");
    const body = (await response.json()) as { ok?: boolean; stats?: AdminStats; message?: string };
    if (!response.ok || !body.stats) {
      setFeedback(body.message ?? "Unable to refresh admin stats.");
      return;
    }
    setStats(body.stats);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function spawn(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/admin/bots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          difficulty,
          ...(callsign.trim() ? { callsign: callsign.trim() } : {}),
        }),
      });
      const body = (await response.json()) as ApiError | { ok: true };
      if (!response.ok) {
        setFeedback("message" in body ? body.message ?? "Unable to deploy bot." : "Unable to deploy bot.");
        return;
      }
      setCallsign("");
      setFeedback(`Deployed ${difficulty.toLowerCase()} bot.`);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function tick(playerId?: string) {
    setPending(true);
    try {
      const response = await fetch("/api/admin/bots/tick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playerId ? { playerId } : {}),
      });
      const body = (await response.json()) as ApiError | { ok: true; ticked?: unknown[] };
      if (!response.ok) {
        setFeedback("message" in body ? body.message ?? "Tick failed." : "Tick failed.");
        return;
      }
      setFeedback(playerId ? "Bot cycle complete." : "Bot roster cycled.");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function toggle(playerId: string, enabled: boolean) {
    setPending(true);
    try {
      await fetch("/api/admin/bots", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId, enabled }),
      });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ash-beige)]" data-testid="admin-feedback" aria-live="polite">
        {feedback}
      </p>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="World" value={(stats.world ?? "—").toUpperCase()} />
        <StatCard label="Humans" value={String(stats.commanders.humans)} testId="admin-humans" />
        <StatCard label="Bots" value={String(stats.commanders.bots)} testId="admin-bots" />
        <StatCard label="Collections" value={String(stats.gathered.collections)} />
      </section>

      <section className="ash-frame p-5" data-testid="admin-resources">
        <p className="ash-label mb-4">Resources gathered</p>
        <div className="grid gap-4 md:grid-cols-2">
          <p className="font-mono text-sm">
            Collected Energy <span className="text-[var(--ash-energy)]">{stats.gathered.energy}</span>
          </p>
          <p className="font-mono text-sm">
            Collected Metal <span className="text-[var(--ash-metal)]">{stats.gathered.metal}</span>
          </p>
          <p className="font-mono text-sm">
            Map Energy {stats.mapNodes.energyRemaining} / {stats.mapNodes.energyCapacity}
          </p>
          <p className="font-mono text-sm">
            Map Metal {stats.mapNodes.metalRemaining} / {stats.mapNodes.metalCapacity}
          </p>
          <p className="font-mono text-sm text-[var(--ash-muted)]">Depleted nodes {stats.mapNodes.depleted}</p>
        </div>
      </section>

      <section className="ash-frame p-5" data-testid="admin-caves">
        <p className="ash-label mb-4">Caves explored</p>
        <p className="font-mono text-sm">
          {stats.caves.clears} clears · {stats.caves.uniqueExplored} unique caves · {stats.caves.materialized}{" "}
          materialized
        </p>
      </section>

      <section className="ash-frame p-5" data-testid="admin-battles">
        <p className="ash-label mb-4">Battle reports</p>
        {stats.battles.length === 0 ? (
          <p className="text-sm text-[var(--ash-muted)]">No battles recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-[var(--ash-muted)]">
                <tr>
                  <th className="py-2 pr-3 font-normal">When</th>
                  <th className="py-2 pr-3 font-normal">Kind</th>
                  <th className="py-2 pr-3 font-normal">Outcome</th>
                  <th className="py-2 pr-3 font-normal">Attacker</th>
                  <th className="py-2 pr-3 font-normal">Defender</th>
                  <th className="py-2 pr-3 font-normal">Loot</th>
                </tr>
              </thead>
              <tbody>
                {stats.battles.map((battle) => (
                  <tr key={battle.id} className="border-t border-[var(--ash-border)]/50">
                    <td className="py-2 pr-3">{new Date(battle.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-3">{battle.kind}</td>
                    <td className="py-2 pr-3">{battle.outcome}</td>
                    <td className="py-2 pr-3">{battle.attackerName ?? "Unknown"}</td>
                    <td className="py-2 pr-3">{battle.defenderName ?? (battle.kind === "CAVE" ? "Cave" : "Unknown")}</td>
                    <td className="py-2 pr-3">
                      {battle.energyLooted}E / {battle.metalLooted}M
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ash-frame p-5" data-testid="admin-bot-config">
        <p className="ash-label mb-4">Bot configuration</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void spawn(event)}>
          <label className="ash-label">
            Callsign
            <input
              value={callsign}
              onChange={(event) => setCallsign(event.target.value)}
              placeholder="Optional"
              maxLength={16}
              data-testid="bot-callsign"
              className="mt-2 block min-h-11 w-44 border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
            />
          </label>
          <label className="ash-label">
            Difficulty
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
              data-testid="bot-difficulty"
              className="mt-2 block min-h-11 border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
            >
              {Object.entries(balanceV1.bots.difficulties).map(([id, config]) => (
                <option key={id} value={id}>
                  {config.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            data-testid="deploy-bot"
            className="min-h-11 border border-[var(--ash-rust)] px-4 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
          >
            Deploy bot
          </button>
          <button
            type="button"
            disabled={pending || stats.bots.length === 0}
            data-testid="tick-bots"
            onClick={() => void tick()}
            className="min-h-11 border border-[var(--ash-olive)] px-4 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
          >
            Run bot cycle
          </button>
        </form>
        <p className="mt-3 text-xs text-[var(--ash-muted)]">
          Scout gathers close to home. Raider explores, clears caves, and raids. Warlord presses harder on all three.
          Bots use the same move, gather, raid, and defense rules as commanders.
        </p>

        <div className="mt-5 space-y-3">
          {stats.bots.length === 0 ? (
            <p className="text-sm text-[var(--ash-muted)]">No bots deployed.</p>
          ) : (
            stats.bots.map((bot) => (
              <div
                key={bot.playerId}
                className="flex flex-wrap items-center justify-between gap-3 border border-[var(--ash-border)]/70 px-3 py-3"
                data-testid="bot-row"
              >
                <div>
                  <p className="font-mono text-sm text-[var(--ash-beige)]">{bot.displayName ?? "Unnamed"}</p>
                  <p className="font-mono text-xs text-[var(--ash-muted)]">
                    {bot.difficulty} · {bot.location.type} {bot.location.x}, {bot.location.y} · {bot.resources.energy}E /{" "}
                    {bot.resources.metal}M · {bot.lastAction ?? "idle"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void tick(bot.playerId)}
                    className="min-h-10 border border-[var(--ash-border)] px-3 text-xs uppercase tracking-[0.12em]"
                  >
                    Tick
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void toggle(bot.playerId, !bot.enabled)}
                    className="min-h-10 border border-[var(--ash-border)] px-3 text-xs uppercase tracking-[0.12em]"
                  >
                    {bot.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="ash-frame p-4">
      <p className="ash-label">{label}</p>
      <p className="mt-2 font-mono text-xl text-[var(--ash-beige)]" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}
