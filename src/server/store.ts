import "server-only";

import { Redis } from "@upstash/redis";
import type { Room } from "@/game/room";

/**
 * Room persistence.
 *
 * Rooms live in Upstash Redis, written with a compare-and-set on the room's
 * version so two players acting at the same moment cannot clobber each other —
 * the loser is told to retry against the state that actually won.
 *
 * Without Upstash credentials the store falls back to process memory, which is
 * enough to run and test the whole flow locally. It is NOT enough in
 * production: serverless invocations do not share memory, so a deployed room
 * would appear to reset at random. The lobby says so, and `isPersistent()`
 * lets the UI warn.
 */

export interface RoomStore {
  get(id: string): Promise<Room | null>;
  create(room: Room): Promise<boolean>;
  /** Writes only if the stored version still matches `expectedVersion`. */
  compareAndSet(room: Room, expectedVersion: number): Promise<boolean>;
  isPersistent(): boolean;
}

const ROOM_TTL_SECONDS = 60 * 60 * 12;
const key = (id: string) => `mahjong:room:${id}`;

class MemoryStore implements RoomStore {
  private rooms = new Map<string, string>();

  async get(id: string): Promise<Room | null> {
    const raw = this.rooms.get(key(id));
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async create(room: Room): Promise<boolean> {
    if (this.rooms.has(key(room.id))) return false;
    this.rooms.set(key(room.id), JSON.stringify(room));
    return true;
  }

  async compareAndSet(room: Room, expectedVersion: number): Promise<boolean> {
    const raw = this.rooms.get(key(room.id));
    if (!raw) return false;
    if ((JSON.parse(raw) as Room).version !== expectedVersion) return false;
    this.rooms.set(key(room.id), JSON.stringify(room));
    return true;
  }

  isPersistent(): boolean {
    return false;
  }
}

/** Swap the stored value only when its version field is the one we read. */
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then return 0 end
if tonumber(string.match(current, '"version":(%d+)')) ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;

class UpstashStore implements RoomStore {
  constructor(private redis: Redis) {}

  async get(id: string): Promise<Room | null> {
    const raw = await this.redis.get<string | Room>(key(id));
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as Room) : raw;
  }

  async create(room: Room): Promise<boolean> {
    const result = await this.redis.set(key(room.id), JSON.stringify(room), {
      nx: true,
      ex: ROOM_TTL_SECONDS,
    });
    return result === "OK";
  }

  async compareAndSet(room: Room, expectedVersion: number): Promise<boolean> {
    const result = await this.redis.eval(
      CAS_SCRIPT,
      [key(room.id)],
      [String(expectedVersion), JSON.stringify(room), String(ROOM_TTL_SECONDS)],
    );
    return result === 1;
  }

  isPersistent(): boolean {
    return true;
  }
}

let cached: RoomStore | null = null;

export function roomStore(): RoomStore {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? new UpstashStore(new Redis({ url, token })) : new MemoryStore();
  return cached;
}
