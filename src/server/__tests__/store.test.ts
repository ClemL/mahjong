import { execFileSync, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGame, nextHand } from "@/game/engine";
import { autoPlayHand } from "@/game/controller";
import { createRng } from "@/game/rng";
import { type Room, newRoom } from "@/game/room";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { CAS_SCRIPT, decodeRoom, encodeRoom, roomStore } = await import("../store");

/** A table some way into a game, where the room is at its largest. */
function playedRoom(hands: number): Room {
  const room = newRoom("TABLE", undefined, 7);
  let state = createGame({ seed: 7 });
  for (const p of state.players) p.isHuman = false;
  const rng = createRng(3);
  for (let h = 0; h < hands; h++) {
    state = autoPlayHand(state, rng).state;
    if (state.phase === "gameOver") break;
    state = nextHand(state);
  }
  return { ...room, state, version: 41 };
}

describe("room encoding", () => {
  it("round-trips a room exactly", () => {
    const room = playedRoom(3);
    expect(decodeRoom(encodeRoom(room))).toEqual(room);
  });

  it("keeps the version readable in front", () => {
    expect(encodeRoom(playedRoom(1))).toMatch(/^v41:/);
  });

  it("is a fraction of the JSON late in a game", () => {
    const room = playedRoom(8);
    const json = JSON.stringify(room).length;
    expect(json).toBeGreaterThan(20_000);
    expect(encodeRoom(room).length).toBeLessThan(json / 4);
  });

  it("still reads a room written as plain JSON, parsed or not", () => {
    const room = playedRoom(1);
    expect(decodeRoom(JSON.stringify(room))).toEqual(room);
    expect(decodeRoom(room)).toBe(room);
  });

  it("is what the memory store keeps", async () => {
    const room = newRoom("TABLE2");
    await roomStore().delete(room.id);
    await roomStore().create(room);
    expect(await roomStore().get(room.id)).toEqual(room);
    expect(await roomStore().compareAndSet({ ...room, version: room.version + 1 }, room.version)).toBe(true);
    expect(await roomStore().compareAndSet({ ...room, version: room.version + 2 }, room.version)).toBe(false);
    expect((await roomStore().get(room.id))?.version).toBe(room.version + 1);
  });
});

/**
 * The compare-and-set script runs on Upstash, out of reach of the tests, so it
 * is checked against a local Redis when one is installed.
 */
const hasRedis = (() => {
  try {
    execFileSync("redis-server", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasRedis)("the compare-and-set script", () => {
  const port = String(16379 + Math.floor(Math.random() * 1000));
  let server: ReturnType<typeof spawn> | null = null;
  const cli = (...args: string[]) =>
    execFileSync("redis-cli", ["-p", port, ...args], { encoding: "utf8" }).trim();
  const cas = (expected: number, value: string) => cli("EVAL", CAS_SCRIPT, "1", "room", String(expected), value, "60");

  beforeAll(async () => {
    server = spawn("redis-server", ["--port", port, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
    for (let i = 0; i < 50; i++) {
      try {
        if (cli("PING") === "PONG") return;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("redis-server did not start");
  });

  afterAll(() => {
    server?.kill();
  });

  it("swaps a deflated room only from the version it was read at", () => {
    const room = playedRoom(2);
    cli("SET", "room", encodeRoom(room));
    expect(cas(40, encodeRoom({ ...room, version: 42 }))).toBe("0");
    expect(cas(41, encodeRoom({ ...room, version: 42 }))).toBe("1");
    expect(decodeRoom(cli("GET", "room")).version).toBe(42);
  });

  it("swaps a room written as plain JSON before compression", () => {
    const room = playedRoom(1);
    cli("SET", "room", JSON.stringify(room));
    expect(cas(41, encodeRoom({ ...room, version: 42 }))).toBe("1");
    expect(cli("GET", "room")).toMatch(/^v42:/);
  });

  it("refuses a room that is not there", () => {
    cli("DEL", "room");
    expect(cas(0, "v1:")).toBe("0");
  });
});
