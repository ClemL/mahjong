import "server-only";

import { deflateRawSync, inflateRawSync } from "node:zlib";
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

/**
 * Rooms are stored deflated. Every poll reads the whole room, which reaches
 * 28 KB of JSON late in a game, and at five devices polling about once a second
 * that bandwidth was the first of Upstash's free-tier limits a table ran into.
 * Deflated it is about 5 KB. The version is kept readable in front, so the
 * compare-and-set script can check it without inflating anything.
 */
export function encodeRoom(room: Room): string {
  return `v${room.version}:${deflateRawSync(JSON.stringify(room)).toString("base64")}`;
}

/**
 * Reads either form: a room written before compression is plain JSON, which
 * the Upstash client may already have parsed into an object.
 */
export function decodeRoom(raw: string | Room): Room {
  if (typeof raw !== "string") return raw;
  const prefix = /^v\d+:/.exec(raw);
  if (!prefix) return JSON.parse(raw) as Room;
  const packed = Buffer.from(raw.slice(prefix[0].length), "base64");
  return JSON.parse(inflateRawSync(packed).toString("utf8")) as Room;
}

export interface RoomStore {
  get(id: string): Promise<Room | null>;
  create(room: Room): Promise<boolean>;
  /** Writes only if the stored version still matches `expectedVersion`. */
  compareAndSet(room: Room, expectedVersion: number): Promise<boolean>;
  /** Removes a room, so the next arrival deals a fresh table. */
  delete(id: string): Promise<void>;
  isPersistent(): boolean;
}

const ROOM_TTL_SECONDS = 60 * 60 * 12;
const key = (id: string) => `mahjong:room:${id}`;

class MemoryStore implements RoomStore {
  private rooms = new Map<string, string>();

  async get(id: string): Promise<Room | null> {
    const raw = this.rooms.get(key(id));
    return raw ? decodeRoom(raw) : null;
  }

  async create(room: Room): Promise<boolean> {
    if (this.rooms.has(key(room.id))) return false;
    this.rooms.set(key(room.id), encodeRoom(room));
    return true;
  }

  async compareAndSet(room: Room, expectedVersion: number): Promise<boolean> {
    const raw = this.rooms.get(key(room.id));
    if (!raw) return false;
    if (decodeRoom(raw).version !== expectedVersion) return false;
    this.rooms.set(key(room.id), encodeRoom(room));
    return true;
  }

  async delete(id: string): Promise<void> {
    this.rooms.delete(key(id));
  }

  isPersistent(): boolean {
    return false;
  }
}

/**
 * Swap the stored value only when its version is the one we read — from the
 * prefix of a deflated room, or the field of one written as plain JSON.
 */
export const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then return 0 end
local version = string.match(current, '^v(%d+):') or string.match(current, '"version":(%d+)')
if tonumber(version) ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;

class UpstashStore implements RoomStore {
  constructor(private redis: Redis) {}

  async get(id: string): Promise<Room | null> {
    const raw = await this.redis.get<string | Room>(key(id));
    return raw ? decodeRoom(raw) : null;
  }

  async create(room: Room): Promise<boolean> {
    const result = await this.redis.set(key(room.id), encodeRoom(room), {
      nx: true,
      ex: ROOM_TTL_SECONDS,
    });
    return result === "OK";
  }

  async compareAndSet(room: Room, expectedVersion: number): Promise<boolean> {
    const result = await this.redis.eval(
      CAS_SCRIPT,
      [key(room.id)],
      [String(expectedVersion), encodeRoom(room), String(ROOM_TTL_SECONDS)],
    );
    return result === 1;
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(key(id));
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
