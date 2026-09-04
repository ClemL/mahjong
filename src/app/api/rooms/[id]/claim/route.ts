import { NextResponse } from "next/server";
import { RoomError, claimSeat } from "@/server/rooms";
import type { Seat } from "@/game/tiles";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      seat?: number | "table";
      password?: string;
      name?: string;
    };
    const seat = body.seat === "table" ? "table" : ((body.seat ?? -1) as Seat);
    if (seat !== "table" && ![0, 1, 2, 3].includes(seat)) {
      return NextResponse.json({ error: "Pick a seat" }, { status: 400 });
    }
    const result = await claimSeat(id, { seat, password: body.password ?? "", name: body.name });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not take that seat" }, { status: 500 });
  }
}
