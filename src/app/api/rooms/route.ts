import { NextResponse } from "next/server";
import { RoomError, createRoom, multiplayerEnabled } from "@/server/rooms";
import { enforceLimit } from "@/server/ratelimit";
import { roomStore } from "@/server/store";

export const dynamic = "force-dynamic";
// Seat tokens and the constant-time password check need node:crypto.
export const runtime = "nodejs";

/**
 * Status and self-diagnosis.
 *
 * This reports which deployment is answering and which variables it can see,
 * because "multiplayer is off" has two very different causes that look
 * identical from the browser: the variable really is unset, or the running
 * deployment predates it being added. Vercel snapshots environment variables
 * at deploy time, so adding one and not redeploying changes nothing.
 *
 * No secret values are returned — only whether each name is present.
 */
export async function GET() {
  return NextResponse.json({
    enabled: multiplayerEnabled(),
    persistent: roomStore().isPersistent(),
    deployment: {
      environment: process.env.VERCEL_ENV ?? "self-hosted",
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown").slice(0, 7),
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    },
    variables: {
      MAHJONG_ROOM_PASSWORD: Boolean(process.env.MAHJONG_ROOM_PASSWORD),
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    },
  });
}

export async function POST(request: Request) {
  try {
    await enforceLimit("create", request);
    const body = (await request.json()) as { password?: string };
    const room = await createRoom(body.password ?? "");
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not create a room" }, { status: 500 });
  }
}
