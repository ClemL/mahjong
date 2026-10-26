import { NextResponse } from "next/server";
import { RoomError, listGames } from "@/server/rooms";

export const dynamic = "force-dynamic";

/** The table's finished games: who played, where they finished, and the hand everyone remembers. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ games: await listGames(id) });
  } catch (error) {
    if (error instanceof RoomError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not read the table's games" }, { status: 500 });
  }
}
