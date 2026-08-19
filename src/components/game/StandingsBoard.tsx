"use client";

import type { RaidIntel, StandingEntry, WorldStandings } from "@/game/domain/types";

export function StandingsBoard({ standings }: { standings: WorldStandings }) {
  return (
    <div className="space-y-6">
      <section className="ash-frame p-4" data-testid="standings-you">
        <p className="ash-label">Your standing</p>
        {standings.you ? (
          <p className="mt-2 font-mono text-lg text-[var(--ash-beige)]" data-testid="standings-you-rank">
            #{standings.you.rank} · {standings.you.callsign} · {standings.you.score} pts
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--ash-muted)]">Claim a callsign to enter the world board.</p>
        )}
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-[var(--ash-muted)]">
          {standings.commanderCount} named commanders on {standings.world}
        </p>
      </section>

      <section className="ash-frame overflow-x-auto p-4" aria-label="World board">
        <p className="ash-label mb-3">World board</p>
        {standings.board.length === 0 ? (
          <p className="text-sm text-[var(--ash-muted)]">No named commanders are ranked yet.</p>
        ) : (
          <table className="w-full min-w-[36rem] border-collapse text-left" data-testid="standings-board">
            <thead>
              <tr className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--ash-muted)]">
                <th className="pb-2 pr-3 font-normal">Rank</th>
                <th className="pb-2 pr-3 font-normal">Callsign</th>
                <th className="pb-2 pr-3 font-normal">Kind</th>
                <th className="pb-2 pr-3 font-normal">Base</th>
                <th className="pb-2 pr-3 font-normal">Storage</th>
                <th className="pb-2 pr-3 font-normal">Raids</th>
                <th className="pb-2 pr-3 font-normal">Caves</th>
                <th className="pb-2 font-normal">Score</th>
              </tr>
            </thead>
            <tbody>
              {standings.board.map((row) => (
                <StandingRow key={`${row.rank}-${row.callsign}`} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ash-frame p-4" aria-label="Raid intel">
        <p className="ash-label mb-3">Raid intel</p>
        {standings.intel.length === 0 ? (
          <p className="text-sm text-[var(--ash-muted)]">No public raids have been resolved yet.</p>
        ) : (
          <ul className="space-y-2" data-testid="raid-intel">
            {standings.intel.map((entry) => (
              <IntelRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StandingRow({ row }: { row: StandingEntry }) {
  return (
    <tr
      className={`font-mono text-sm ${row.you ? "text-[var(--ash-beige)]" : "text-[var(--ash-text)]"}`}
      data-testid="standing-row"
      data-you={row.you ? "true" : "false"}
    >
      <td className="py-1.5 pr-3">#{row.rank}</td>
      <td className="py-1.5 pr-3">{row.callsign}</td>
      <td className="py-1.5 pr-3">{row.kind === "BOT" ? "Bot" : "Human"}</td>
      <td className="py-1.5 pr-3">{row.baseLevel}</td>
      <td className="py-1.5 pr-3">{row.storageLevel}</td>
      <td className="py-1.5 pr-3">{row.raidWins}</td>
      <td className="py-1.5 pr-3">{row.caveClears}</td>
      <td className="py-1.5">{row.score}</td>
    </tr>
  );
}

function IntelRow({ entry }: { entry: RaidIntel }) {
  const result = entry.outcome === "ATTACKER_WIN" ? "breached" : "held";
  return (
    <li className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--ash-muted)]" data-testid="intel-row">
      {entry.attacker} raided {entry.defender ?? "an unnamed bunker"} · {result}
    </li>
  );
}
