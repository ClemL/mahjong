import { NextResponse } from "next/server";
import { RoomError, resetTable } from "@/server/rooms";
import { enforceLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/** Empty the room from the seat picker. No token: whoever asks has no seat. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await enforceLimit("reset", request);
    return NextResponse.json(await resetTable(id));
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not reset the table" }, { status: 500 });
  }
}
