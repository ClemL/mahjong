/** Shared error type so the limiter and the room service report the same way. */
export class RoomError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
