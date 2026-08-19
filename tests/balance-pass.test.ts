import { describe, expect, it } from "vitest";
import { balanceV1 } from "@/game/config/balance.v1";
import { applyCaveBattleAdjustments, casualtyCount, resolveCombat, simulateAttackerWinRate } from "@/game/services/combat";
import { caveRequiredPower } from "@/game/services/troop-state";
import { caveTierFromRoll, pickToolAffinity } from "@/game/world/caves";
import { applyCollectionBonus, baseUpgradeMetalCost, storageUpgradeMetalCost } from "@/game/world/nodes";
import { stackToolBonusBps } from "@/game/world/tools";
import { createSeededRng } from "@/game/world/rng";

describe("economy balance pass", () => {
  it("raises upgrade gates without soft-locking the first base level", () => {
    expect(baseUpgradeMetalCost(1)).toBe(120);
    expect(baseUpgradeMetalCost(4)).toBe(4200);
    expect(storageUpgradeMetalCost(1)).toBe(100);
    expect(storageUpgradeMetalCost(4)).toBe(2600);
    expect(balanceV1.startingResources.metal).toBeGreaterThanOrEqual(baseUpgradeMetalCost(1)!);
    expect(balanceV1.startingResources.metal).toBeLessThan(baseUpgradeMetalCost(1)! + baseUpgradeMetalCost(2)!);
  });

  it("stacks tools with diminishing returns and a hard cap", () => {
    const single = stackToolBonusBps([balanceV1.economy.tools.bonusBpsByTier[1]]);
    const triple = stackToolBonusBps([
      balanceV1.economy.tools.bonusBpsByTier[1],
      balanceV1.economy.tools.bonusBpsByTier[1],
      balanceV1.economy.tools.bonusBpsByTier[1],
    ]);
    const manyHigh = stackToolBonusBps(Array.from({ length: 8 }, () => balanceV1.economy.tools.bonusBpsByTier[5]));

    expect(single).toBe(800);
    expect(triple).toBeGreaterThan(single);
    expect(triple).toBeLessThan(single * 2);
    expect(manyHigh).toBeLessThanOrEqual(balanceV1.economy.tools.maxStackedBonusBps);
    expect(manyHigh).toBeGreaterThan(single * 5);
    expect(stackToolBonusBps([15_000, 15_000])).toBe(balanceV1.economy.tools.maxStackedBonusBps);
    expect(applyCollectionBonus(30, triple)).toBeLessThan(30 * 2.2);
  });
});

describe("cave balance pass", () => {
  it("assigns weighted cave tiers instead of flat tier 1", () => {
    expect(caveTierFromRoll(0)).toBe(1);
    expect(caveTierFromRoll(5499)).toBe(1);
    expect(caveTierFromRoll(5500)).toBe(2);
    expect(caveTierFromRoll(9800)).toBe(5);
  });

  it("requires more offense for higher cave tiers", () => {
    expect(caveRequiredPower(1)).toBeGreaterThan(20);
    expect(caveRequiredPower(5)).toBeGreaterThan(caveRequiredPower(2) * 2);
  });

  it("forces at least one casualty on routine cave wins", () => {
    const report = resolveCombat({
      attacker: { quantity: 6, powerPerUnit: balanceV1.troops.offenseAttack },
      defender: {
        quantity: balanceV1.combat.caveDefenseUnitsByTier[1],
        powerPerUnit: balanceV1.combat.caveDefensePowerByTier[1],
      },
      rng: createSeededRng("cave-balance-win"),
      seed: "cave-balance-win",
    });
    expect(report.outcome).toBe("ATTACKER_WIN");
    const adjusted = applyCaveBattleAdjustments(report, 1);
    expect(adjusted.attackerCasualties).toBeGreaterThanOrEqual(1);
  });

  it("simulates 11 tier-1 cave clears with casualties on most wins", () => {
    let wins = 0;
    let losses = 0;
    let zeroCasualtyWins = 0;
    for (let i = 0; i < 11; i += 1) {
      const resolved = resolveCombat({
        attacker: { quantity: 2, powerPerUnit: balanceV1.troops.offenseAttack },
        defender: {
          quantity: balanceV1.combat.caveDefenseUnitsByTier[1],
          powerPerUnit: balanceV1.combat.caveDefensePowerByTier[1],
        },
        rng: createSeededRng(`cave-streak:${i}`),
        seed: `cave-streak:${i}`,
      });
      const battle = applyCaveBattleAdjustments(resolved, 1);
      if (battle.outcome === "ATTACKER_WIN") {
        wins += 1;
        if (battle.attackerCasualties === 0) {
          zeroCasualtyWins += 1;
        }
      } else {
        losses += 1;
      }
    }
    expect(wins + losses).toBe(11);
    expect(zeroCasualtyWins).toBe(0);
    expect(losses).toBeGreaterThan(0);
  });
});

describe("combat balance regression", () => {
  const trials = 12_000;
  const seed = "ashfall-combat-sim-v2";

  it("keeps base defense near the 55-60% target", () => {
    const attackerWin = simulateAttackerWinRate({
      powerRatioX100: 100,
      trials,
      seed: `${seed}:base`,
      defenderModifierBps: balanceV1.combat.baseDefenseModifierBps,
      rngFactory: createSeededRng,
    });
    const defenderWin = 1 - attackerWin;
    expect(defenderWin).toBeGreaterThanOrEqual(0.55);
    expect(defenderWin).toBeLessThanOrEqual(0.6);
  });
});

describe("tool affinity weighting", () => {
  it("still favors the weaker slot", () => {
    expect(pickToolAffinity({ energyTier: 3, metalTier: 1, roll: 34 })).toBe("ENERGY");
    expect(pickToolAffinity({ energyTier: 3, metalTier: 1, roll: 35 })).toBe("METAL");
  });
});
