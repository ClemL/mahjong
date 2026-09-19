import { describe, expect, it } from "vitest";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { FIXED_ROOM_ID, RoomError, act, claimSeat, control, passwordRequired, readRoom } =
  await import("../rooms");
const { roomStore } = await import("../store");

const ID = FIXED_ROOM_ID;

/** The one table, wiped back to an empty lobby. */
async function room(): Promise<string> {
  await roomStore().delete(ID);
  return ID;
}

/** A table past its lobby: seats taken, a tablet in the middle, tiles dealt. */
async function dealtRoom(seats: (0 | 1 | 2 | 3)[] = [0]) {
  const id = await room();
  const tokens: Record<number, string> = {};
  for (const seat of seats) {
    tokens[seat] = (await claimSeat(id, { seat })).token;
  }
  const table = (await claimSeat(id, { seat: "table" })).token;
  await control(id, table, { type: "deal" });
  return { id, tokens, table };
}

describe("the single table", () => {
  it("needs no password for now", () => {
    expect(passwordRequired()).toBe(false);
  });

  it("opens on first arrival rather than being created by hand", async () => {
    const id = await room();
    const view = await readRoom(id, null);
    expect(view.roomId).toBe(ID);
    expect(view.started).toBe(false);
    expect(view.players.every((p) => p.occupant.kind === "open")).toBe(true);
  });

  it("serves the same table to everyone", async () => {
    const id = await room();
    await claimSeat(id, { seat: 0, name: "Kris" });
    expect((await readRoom(id, null)).players[0].occupant.name).toBe("Kris");
  });

  it("refuses any other room id", async () => {
    await expect(readRoom("XYZW", null)).rejects.toMatchObject({ status: 404 });
    await expect(claimSeat("XYZW", { seat: 0 })).rejects.toMatchObject({ status: 404 });
  });
});

describe("claiming seats", () => {
  it("seats anyone who asks", async () => {
    const id = await room();
    const { token, view } = await claimSeat(id, { seat: 2, name: "Teja" });
    expect(token).toBeTruthy();
    expect(view.you).toEqual({ role: "player", seat: 2 });
    expect(view.players[2].occupant).toEqual({ kind: "human", name: "Teja", away: false });
  });

  it("refuses a seat that is already taken", async () => {
    const id = await room();
    await claimSeat(id, { seat: 1 });
    await expect(claimSeat(id, { seat: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("allows exactly one table device", async () => {
    const id = await room();
    await claimSeat(id, { seat: "table" });
    await expect(claimSeat(id, { seat: "table" })).rejects.toMatchObject({ status: 409 });
  });

  it("falls back to a seat label when no name is given", async () => {
    const id = await room();
    const { view } = await claimSeat(id, { seat: 3, name: "   " });
    expect(view.players[3].occupant.name).toBe("Seat 4");
  });
});

describe("the lobby", () => {
  it("holds the tiles until the table deals", async () => {
    const id = await room();
    await claimSeat(id, { seat: 0 });
    const waiting = await readRoom(id, null);
    expect(waiting.started).toBe(false);
    expect(waiting.players.every((p) => p.handCount === 0)).toBe(true);
    expect(waiting.wallCount).toBe(0);
  });

  it("refuses to deal a table nobody is sitting at", async () => {
    const id = await room();
    const { token } = await claimSeat(id, { seat: "table" });
    await expect(control(id, token, { type: "deal" })).rejects.toMatchObject({ status: 409 });
  });

  it("deals once, and only once", async () => {
    const { id, table } = await dealtRoom([0]);
    const view = await readRoom(id, null);
    expect(view.started).toBe(true);
    expect(view.wallCount).toBeGreaterThan(0);
    await expect(control(id, table, { type: "deal" })).rejects.toMatchObject({ status: 409 });
  });

  it("lets a player deal when there is no tablet, but not when there is", async () => {
    const alone = await room();
    const { token } = await claimSeat(alone, { seat: 0 });
    expect((await control(alone, token, { type: "deal" })).started).toBe(true);

    const withTablet = await room();
    const player = await claimSeat(withTablet, { seat: 0 });
    await claimSeat(withTablet, { seat: "table" });
    await expect(control(withTablet, player.token, { type: "deal" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("holds everyone at the same starting line no matter who arrived first", async () => {
    const id = await room();
    // Kris connects, then puts the phone down while the others walk over.
    await claimSeat(id, { seat: 2, name: "Kris" });
    await readRoom(id, null);
    await readRoom(id, null);
    for (const seat of [0, 1, 3] as const) {
      await claimSeat(id, { seat });
    }
    const view = await readRoom(id, null);
    // Nobody has had a tile thrown for them by the computer in the meantime.
    expect(view.players.every((p) => p.discards.length === 0)).toBe(true);
    expect(view.started).toBe(false);
  });
});

describe("playing", () => {
  it("rejects an action from someone with no seat", async () => {
    const { id } = await dealtRoom();
    await expect(act(id, "not-a-token", { type: "win" })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a discard when it is not your turn", async () => {
    // Two people, so play stops at one of them and the other is off turn.
    const { id, tokens } = await dealtRoom([0, 1]);
    const view = await readRoom(id, tokens[0]);
    if (view.phase !== "action") return;
    const offTurn = view.turn === 0 ? tokens[1] : tokens[0];
    await expect(act(id, offTurn, { type: "discard", tileId: "whatever" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("lets the seated player discard on their turn", async () => {
    const { id, tokens } = await dealtRoom([0, 1, 2, 3]);
    let view = await readRoom(id, tokens[0]);
    const token = tokens[view.turn];
    view = await readRoom(id, token);
    expect(view.actions?.canDiscard).toBe(true);
    const seat = view.you.seat!;
    const tile = view.players[seat].hand[0];
    const after = await act(id, token, { type: "discard", tileId: tile.id });
    expect(after.version).toBeGreaterThan(view.version);
  });

  it("fills unclaimed seats with the computer and keeps play moving", async () => {
    // The table is seeded from the clock, so one deal proves very little.
    // Twenty of them cover the openings where a computer seat claims the first
    // discard, or wins off it outright.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = await room();
      const { token } = await claimSeat(id, { seat: 0 });
      let view = await control(id, token, { type: "deal" });
      // Seat 0 is the dealer on the opening hand, so the turn is already here.
      expect(view.turn).toBe(0);
      const wallBefore = view.wallCount;
      await act(id, token, { type: "discard", tileId: view.players[0].hand[0].id });
      view = await readRoom(id, token);

      // The property that matters: the table never parks on a chair nobody is
      // sitting in. It comes back round to the one person here, stops to ask
      // them something, or the hand is already over.
      //
      // There is no scalar that also proves "and the computers took their
      // turns", because a claim chain is a legitimate way round the table that
      // moves none of them. A claimed tile leaves the discarder's pond for the
      // claimer's meld, so the discard total can be unchanged after a full
      // circuit; and a pung draws nothing, so the wall can be unchanged too.
      // Getting back to seat 0 at all is the proof.
      const over = view.phase === "handOver" || view.phase === "gameOver";
      if (!over) expect(view.turn === 0 || view.awaitingClaimSeats.includes(0)).toBe(true);
      expect(view.wallCount).toBeLessThanOrEqual(wallBefore);
    }
  });
});

describe("table control", () => {
  it("refuses commands from a player", async () => {
    const id = await room();
    const { token } = await claimSeat(id, { seat: 0 });
    await expect(control(id, token, { type: "restart" })).rejects.toMatchObject({ status: 403 });
    expect(RoomError).toBeDefined();
  });

  it("lets the table change the faan minimum and free a seat", async () => {
    const id = await room();
    await claimSeat(id, { seat: 1, name: "Parth" });
    const { token } = await claimSeat(id, { seat: "table" });
    expect((await control(id, token, { type: "minFaan", value: 3 })).config.minFaan).toBe(3);
    expect((await control(id, token, { type: "freeSeat", seat: 1 })).players[1].occupant.kind).toBe(
      "open",
    );
  });

  it("restarts back to the lobby while keeping everyone seated", async () => {
    const { id, table } = await dealtRoom([0]);
    await claimSeat(id, { seat: 1, name: "Kris" });
    const restarted = await control(id, table, { type: "restart" });
    expect(restarted.players[1].occupant.name).toBe("Kris");
    expect(restarted.scores).toEqual([0, 0, 0, 0]);
    // Back to the gathering screen: nobody is holding tiles until someone deals.
    expect(restarted.started).toBe(false);
    expect(restarted.players.every((p) => p.handCount === 0)).toBe(true);
    expect((await control(id, table, { type: "deal" })).handNumber).toBe(1);
  });
});

describe("playing the computer while you wait", () => {
  it("marks a solo deal as a warm-up and offers to regroup when someone joins", async () => {
    const id = await room();
    const { token } = await claimSeat(id, { seat: 0, name: "Kris" });
    const solo = await control(id, token, { type: "deal" });
    expect(solo.warmup).toBe(true);
    expect(solo.seatedCount).toBe(1);
    expect(solo.canRegroup).toBe(false);

    await claimSeat(id, { seat: 2, name: "Srini" });
    const joined = await readRoom(id, token);
    expect(joined.canRegroup).toBe(true);

    const back = await control(id, token, { type: "regroup" });
    expect(back.started).toBe(false);
    expect(back.warmup).toBe(false);
    // Both chairs survive the regroup; only the practice hand is dropped.
    expect(back.players[0].occupant.name).toBe("Kris");
    expect(back.players[2].occupant.name).toBe("Srini");
    expect(back.players.every((p) => p.handCount === 0)).toBe(true);
  });

  it("refuses to regroup a real game", async () => {
    const { id, tokens, table } = await dealtRoom([0, 1, 2, 3]);
    expect((await readRoom(id, tokens[0])).warmup).toBe(false);
    await expect(control(id, table, { type: "regroup" })).rejects.toMatchObject({ status: 409 });
    await expect(control(id, tokens[1], { type: "regroup" })).rejects.toMatchObject({ status: 403 });
  });
});
