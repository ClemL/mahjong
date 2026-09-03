/** Small deterministic PRNG (mulberry32) so games can be replayed from a seed. */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: T[]): T;
  seed: number;
}

export function createRng(seed = Math.floor(Math.random() * 0xffffffff)): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    pick<T>(items: T[]): T {
      return items[Math.floor(next() * items.length)];
    },
  };
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
