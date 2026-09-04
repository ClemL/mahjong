import { NextResponse } from "next/server";
import { type PlayerAction, RoomError, act } from "@/server/rooms";
import { enforceLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await enforceLimit("act", request);
    const body = (await request.json()) as { token?: string; action?: PlayerAction };
    if (!body.token || !body.action) {
      return NextResponse.json({ error: "Missing token or action" }, { status: 400 });
    }
    return NextResponse.json(await act(id, body.token, body.action));
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not play that" }, { status: 500 });
  }
}
