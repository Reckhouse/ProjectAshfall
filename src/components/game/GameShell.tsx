import type { PlayerSnapshot } from "@/game/domain/types";
import { LogoutButton } from "@/components/game/LogoutButton";

export function GameShell({ player }: { player: PlayerSnapshot }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="ash-label">Command shell</p>
      <h1 className="mt-3 text-4xl font-semibold text-[var(--ash-beige)]">PROJECT ASHFALL</h1>
      <section className="ash-frame mt-8 space-y-5 p-6" aria-label="Base status">
        <StatusRow label="Base status" value={player.base ? "ESTABLISHED" : "PENDING"} />
        <StatusRow label="World" value={(player.world ?? "UNKNOWN").toUpperCase()} />
        <StatusRow
          label="Coordinate"
          value={player.base ? `${player.base.x}, ${player.base.y}` : "UNASSIGNED"}
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
      </section>
      <p className="mt-6 text-sm text-[var(--ash-muted)]">World grid unlocks in Phase 2.</p>
      <div className="mt-8">
        <LogoutButton />
      </div>
    </main>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "energy" | "metal";
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
      <span className={`ash-value ${valueClass}`}>{value}</span>
    </div>
  );
}
