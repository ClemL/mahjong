import { NextResponse } from "next/server";
import { RoomError, holdsResetKey, resetTable } from "@/server/rooms";
import { enforceLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Empty the room from the seat picker. No token: whoever asks has no seat, so
 * a game in progress is refused unless the request carries the deployment's
 * reset key in `x-reset-key`.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await enforceLimit("reset", request);
    return NextResponse.json(await resetTable(id, { operator: holdsResetKey(request.headers.get("x-reset-key")) }));
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not reset the table" }, { status: 500 });
  }
}
