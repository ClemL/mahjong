import { NextResponse } from "next/server";
import { RoomError, createRoom, multiplayerEnabled } from "@/server/rooms";
import { roomStore } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    enabled: multiplayerEnabled(),
    persistent: roomStore().isPersistent(),
  });
}

export async function POST(request: Request) {
  try {
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
