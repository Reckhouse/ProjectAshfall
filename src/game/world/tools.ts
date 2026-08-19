import { balanceV1 } from "@/game/config/balance.v1";

export function stackToolBonusBps(bonusValues: readonly number[]): number {
  if (bonusValues.length === 0) {
    return 0;
  }
  const sorted = [...bonusValues].sort((left, right) => right - left);
  const factor = balanceV1.economy.tools.stackDiminishBps / 10_000;
  let total = 0;
  let weight = 1;
  for (const bonus of sorted) {
    total += Math.floor(bonus * weight);
    weight *= factor;
  }
  return Math.min(total, balanceV1.economy.tools.maxStackedBonusBps);
}

export function toolSlotSummary(tools: readonly { tier: number; collectionBonusBps: number }[]): {
  tier: number;
  bonusBps: number;
  count: number;
} | null {
  if (tools.length === 0) {
    return null;
  }
  const tier = Math.max(...tools.map((tool) => tool.tier));
  return {
    tier,
    bonusBps: stackToolBonusBps(tools.map((tool) => tool.collectionBonusBps)),
    count: tools.length,
  };
}
