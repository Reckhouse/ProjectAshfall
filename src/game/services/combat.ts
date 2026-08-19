import type { Rng } from "@/game/domain/types";
import { balanceV1 } from "@/game/config/balance.v1";

export type CombatOutcome = "ATTACKER_WIN" | "DEFENDER_WIN";

export type CombatSideInput = {
  quantity: number;
  powerPerUnit: number;
  modifierBps?: number;
};

export type BattleReport = {
  outcome: CombatOutcome;
  seed: string;
  attackerCommitted: number;
  defenderCommitted: number;
  attackerCasualties: number;
  defenderCasualties: number;
  attackerRemaining: number;
  defenderRemaining: number;
  attackerPower: number;
  defenderPower: number;
  attackerVarianceBps: number;
  defenderVarianceBps: number;
  summary: string;
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function rollVarianceBps(rng: Rng, minBps = balanceV1.combat.varianceMinBps, maxBps = balanceV1.combat.varianceMaxBps): number {
  return rng.nextInt(minBps, maxBps + 1);
}

export function resolvedPower(input: {
  quantity: number;
  powerPerUnit: number;
  modifierBps?: number;
  varianceBps: number;
}): number {
  const quantity = Math.max(0, Math.trunc(input.quantity));
  const powerPerUnit = Math.max(0, Math.trunc(input.powerPerUnit));
  const modifierBps = input.modifierBps ?? 10_000;
  return Math.floor((quantity * powerPerUnit * modifierBps * input.varianceBps) / 10_000 / 10_000);
}

export function casualtyCount(committed: number, lossBps: number): number {
  if (committed <= 0 || lossBps <= 0) {
    return 0;
  }
  const raw = (committed * lossBps) / 10_000;
  let lost = Math.round(raw);
  if (lost === 0 && lossBps >= 5_000) {
    lost = 1;
  }
  return clampInt(lost, 0, committed);
}

export function lossBps(isWinner: boolean, winnerPower: number, loserPower: number): number {
  const ratioX100 = loserPower <= 0 ? 300 : clampInt(Math.floor((winnerPower * 100) / loserPower), 100, 300);
  if (isWinner) {
    return Math.max(400, Math.floor((1_800 * 100) / ratioX100));
  }
  return Math.min(8_500, 3_000 + ratioX100 * 21);
}

export function formatBattleSummary(report: Omit<BattleReport, "summary">): string {
  const lost = `${report.attackerCasualties} offense lost`;
  if (report.outcome === "ATTACKER_WIN") {
    return `Won the fight. ${report.attackerCommitted} offense in, ${lost}.`;
  }
  return `Lost the fight. ${report.attackerCommitted} offense in, ${lost}.`;
}

export function resolveCombat(input: {
  attacker: CombatSideInput;
  defender: CombatSideInput;
  rng: Rng;
  seed: string;
}): BattleReport {
  const attackerCommitted = Math.max(0, Math.trunc(input.attacker.quantity));
  const defenderCommitted = Math.max(0, Math.trunc(input.defender.quantity));
  const attackerVarianceBps = rollVarianceBps(input.rng);
  const defenderVarianceBps = rollVarianceBps(input.rng);
  const attackerPower = resolvedPower({
    quantity: attackerCommitted,
    powerPerUnit: input.attacker.powerPerUnit,
    modifierBps: input.attacker.modifierBps,
    varianceBps: attackerVarianceBps,
  });
  const defenderPower = resolvedPower({
    quantity: defenderCommitted,
    powerPerUnit: input.defender.powerPerUnit,
    modifierBps: input.defender.modifierBps,
    varianceBps: defenderVarianceBps,
  });

  const attackerWins = attackerPower > defenderPower;
  const winnerPower = attackerWins ? attackerPower : defenderPower;
  const loserPower = attackerWins ? defenderPower : attackerPower;
  const attackerCasualties = casualtyCount(
    attackerCommitted,
    lossBps(attackerWins, winnerPower, loserPower),
  );
  const defenderCasualties = casualtyCount(
    defenderCommitted,
    lossBps(!attackerWins, winnerPower, loserPower),
  );

  const report = {
    outcome: attackerWins ? "ATTACKER_WIN" : "DEFENDER_WIN",
    seed: input.seed,
    attackerCommitted,
    defenderCommitted,
    attackerCasualties,
    defenderCasualties,
    attackerRemaining: attackerCommitted - attackerCasualties,
    defenderRemaining: defenderCommitted - defenderCasualties,
    attackerPower,
    defenderPower,
    attackerVarianceBps,
    defenderVarianceBps,
  } as const;

  return {
    ...report,
    summary: formatBattleSummary(report),
  };
}

export function simulateAttackerWinRate(input: {
  powerRatioX100: number;
  trials: number;
  seed: string;
  defenderModifierBps?: number;
  rngFactory: (seed: string) => Rng;
}): number {
  const defenderQty = 100;
  const attackerQty = Math.max(1, Math.round((defenderQty * input.powerRatioX100) / 100));
  let wins = 0;
  for (let i = 0; i < input.trials; i += 1) {
    const report = resolveCombat({
      attacker: { quantity: attackerQty, powerPerUnit: 10 },
      defender: {
        quantity: defenderQty,
        powerPerUnit: 10,
        modifierBps: input.defenderModifierBps ?? 10_000,
      },
      rng: input.rngFactory(`${input.seed}:${i}`),
      seed: `${input.seed}:${i}`,
    });
    if (report.outcome === "ATTACKER_WIN") {
      wins += 1;
    }
  }
  return wins / input.trials;
}
