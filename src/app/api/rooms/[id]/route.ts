import { NextResponse } from "next/server";
import { RoomError, readRoom } from "@/server/rooms";

export const dynamic = "force-dynamic";

/**
 * The seat token, from the Authorization header. Query strings end up in
 * request logs and browser history, so the token no longer travels in one —
 * but a page loaded before that change still sends it there until it reloads.
 */
function bearerToken(request: Request, url: URL): string | null {
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  return match ? match[1] : url.searchParams.get("token");
}

/**
 * The room as the bearer of the token may see it. `since` lets a poller skip
 * the payload when nothing has changed, which is most of the time.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = bearerToken(request, url);
  const since = Number(url.searchParams.get("since") ?? "0");
  try {
    const view = await readRoom(id, token);
    if (Number.isFinite(since) && since > 0 && view.version <= since) {
      return NextResponse.json({ version: view.version, unchanged: true });
    }
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not read the room" }, { status: 500 });
  }
}
