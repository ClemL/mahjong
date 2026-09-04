import { NextResponse } from "next/server";
import { RoomError, readRoom } from "@/server/rooms";

export const dynamic = "force-dynamic";

/**
 * The room as the bearer of `token` may see it. `since` lets a poller skip the
 * payload when nothing has changed, which is most of the time.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
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
