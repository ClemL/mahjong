import { redirect } from "next/navigation";
import { FIXED_ROOM_ID } from "@/server/rooms";

/** There is one table, so there is nothing to choose here. */
export default function MultiplayerPage() {
  redirect(`/room/${FIXED_ROOM_ID}`);
}
