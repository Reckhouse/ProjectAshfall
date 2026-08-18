import type { Rng } from "@/game/domain/types";

function mix(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return (n ^ (n >>> 16)) >>> 0;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRng(seed: string): Rng {
  let state = hashString(seed) || 1;

  function nextFloat(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    nextFloat,
    nextInt(minInclusive: number, maxExclusive: number): number {
      if (maxExclusive <= minInclusive) {
        throw new RangeError("RNG nextInt requires maxExclusive > minInclusive");
      }
      return minInclusive + Math.floor(nextFloat() * (maxExclusive - minInclusive));
    },
  };
}

export function createCryptoRng(): Rng {
  function nextFloat(): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! / 4294967296;
  }

  return {
    nextFloat,
    nextInt(minInclusive: number, maxExclusive: number): number {
      if (maxExclusive <= minInclusive) {
        throw new RangeError("RNG nextInt requires maxExclusive > minInclusive");
      }
      return minInclusive + Math.floor(nextFloat() * (maxExclusive - minInclusive));
    },
  };
}

export function derivedTileNoise(
  seed: string,
  generationVersion: number,
  x: number,
  y: number,
): number {
  const seedHash = hashString(`${seed}:${generationVersion}`);
  return mix(seedHash ^ mix(x * 374761393 + y * 668265263));
}
