import { NextResponse } from "next/server";
import { FIXED_ROOM_ID, multiplayerEnabled, passwordRequired } from "@/server/rooms";
import { roomStore } from "@/server/store";

export const dynamic = "force-dynamic";
// Seat tokens need node:crypto.
export const runtime = "nodejs";

/**
 * Status and self-diagnosis.
 *
 * Reports which deployment is answering and which variables it can see,
 * because a problem here looks identical from the browser whether the cause is
 * configuration or a stale build. No secret values are returned — only whether
 * each name is present.
 *
 * There is no POST: the deployment serves one fixed table, created on first
 * arrival, rather than a room per game.
 */
export async function GET() {
  return NextResponse.json({
    enabled: multiplayerEnabled(),
    persistent: roomStore().isPersistent(),
    roomId: FIXED_ROOM_ID,
    passwordRequired: passwordRequired(),
    deployment: {
      environment: process.env.VERCEL_ENV ?? "self-hosted",
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown").slice(0, 7),
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    },
    variables: {
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    },
  });
}
