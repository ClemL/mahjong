import { NextResponse } from "next/server";
import { RoomError, type TableCommand, control } from "@/server/rooms";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as { token?: string; command?: TableCommand };
    if (!body.token || !body.command) {
      return NextResponse.json({ error: "Missing token or command" }, { status: 400 });
    }
    return NextResponse.json(await control(id, body.token, body.command));
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not run that command" }, { status: 500 });
  }
}
