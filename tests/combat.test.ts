import { describe, expect, it } from "vitest";
import { balanceV1 } from "@/game/config/balance.v1";
import { casualtyCount, resolveCombat, simulateAttackerWinRate, applyCaveBattleAdjustments } from "@/game/services/combat";
import { createSeededRng } from "@/game/world/rng";

describe("combat resolver", () => {
  it("is deterministic for the same seed", () => {
    const seed = "combat-lock-v1";
    const a = resolveCombat({
      attacker: { quantity: 6, powerPerUnit: 10 },
      defender: { quantity: 6, powerPerUnit: 10, modifierBps: balanceV1.combat.baseDefenseModifierBps },
      rng: createSeededRng(seed),
      seed,
    });
    const b = resolveCombat({
      attacker: { quantity: 6, powerPerUnit: 10 },
      defender: { quantity: 6, powerPerUnit: 10, modifierBps: balanceV1.combat.baseDefenseModifierBps },
      rng: createSeededRng(seed),
      seed,
    });
    expect(a).toEqual(b);
    expect(a.attackerCasualties + a.attackerRemaining).toBe(6);
    expect(a.defenderCasualties + a.defenderRemaining).toBe(6);
  });

  it("never creates negative stacks or casualties above committed troops", () => {
    for (let i = 0; i < 400; i += 1) {
      const attackerQty = 1 + (i % 12);
      const defenderQty = 1 + ((i * 3) % 12);
      const report = resolveCombat({
        attacker: { quantity: attackerQty, powerPerUnit: 10 },
        defender: { quantity: defenderQty, powerPerUnit: 10 },
        rng: createSeededRng(`bound:${i}`),
        seed: `bound:${i}`,
      });
      expect(report.attackerCasualties).toBeGreaterThanOrEqual(0);
      expect(report.defenderCasualties).toBeGreaterThanOrEqual(0);
      expect(report.attackerCasualties).toBeLessThanOrEqual(attackerQty);
      expect(report.defenderCasualties).toBeLessThanOrEqual(defenderQty);
      expect(report.attackerRemaining).toBe(attackerQty - report.attackerCasualties);
      expect(report.defenderRemaining).toBe(defenderQty - report.defenderCasualties);
    }
  });

  it("rewards a prepared expedition against a tier-1 cave", () => {
    const report = applyCaveBattleAdjustments(
      resolveCombat({
        attacker: { quantity: 4, powerPerUnit: balanceV1.troops.offenseAttack },
        defender: {
          quantity: balanceV1.combat.caveDefenseUnitsByTier[1],
          powerPerUnit: balanceV1.combat.caveDefensePowerByTier[1],
        },
        rng: createSeededRng("cave-t1-strong"),
        seed: "cave-t1-strong",
      }),
      1,
    );
    expect(report.outcome).toBe("ATTACKER_WIN");
    expect(report.attackerRemaining).toBeGreaterThan(0);
    expect(report.attackerCasualties).toBeGreaterThanOrEqual(1);
  });

  it("caps casualty math at the committed count", () => {
    expect(casualtyCount(0, 9000)).toBe(0);
    expect(casualtyCount(2, 10_000)).toBe(2);
    expect(casualtyCount(2, 0)).toBe(0);
  });
});

describe("combat simulation targets", () => {
  const trials = 12_000;
  const seed = "ashfall-combat-sim-v1";

  it("raises attacker win rate as power ratio increases", () => {
    const ratios = [50, 80, 100, 125, 200];
    const rates = ratios.map((powerRatioX100) =>
      simulateAttackerWinRate({
        powerRatioX100,
        trials,
        seed: `${seed}:field:${powerRatioX100}`,
        rngFactory: createSeededRng,
      }),
    );
    expect(rates[0]).toBeLessThan(0.02);
    expect(rates[1]).toBeGreaterThan(0.005);
    expect(rates[1]).toBeLessThan(0.15);
    expect(rates[2]).toBeGreaterThan(0.42);
    expect(rates[2]).toBeLessThan(0.55);
    expect(rates[3]).toBeGreaterThan(0.85);
    expect(rates[4]).toBeGreaterThan(0.99);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });

  it("gives equal-troop base defense a 55-60% defender win rate", () => {
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
