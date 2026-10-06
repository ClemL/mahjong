import { redirect } from "next/navigation";
import { FIXED_ROOM_ID } from "@/server/rooms";

/** The old way in, from before there were three tables; it still goes where it always went. */
export default function MultiplayerPage() {
  redirect(`/room/${FIXED_ROOM_ID}`);
}
