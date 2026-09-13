import { beforeEach, describe, expect, it } from "vitest";

process.env.MAHJONG_ROOM_PASSWORD = "lotus";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { DEFAULT_ROOM_PASSWORD, RoomError, act, claimSeat, control, createRoom, readRoom, suggestedPassword } =
  await import("../rooms");

async function room(): Promise<string> {
  return (await createRoom("lotus")).id;
}

/** A room past its lobby: seats taken, a tablet on the table, tiles dealt. */
async function dealtRoom(seats: (0 | 1 | 2 | 3)[] = [0]) {
  const id = await room();
  const tokens: Record<number, string> = {};
  for (const seat of seats) {
    tokens[seat] = (await claimSeat(id, { seat, password: "lotus" })).token;
  }
  const table = (await claimSeat(id, { seat: "table", password: "lotus" })).token;
  await control(id, table, { type: "deal" });
  return { id, tokens, table };
}

describe("creating a room", () => {
  it("refuses the wrong password", async () => {
    await expect(createRoom("wrong")).rejects.toBeInstanceOf(RoomError);
  });

  it("issues a readable code", async () => {
    const { id } = await createRoom("lotus");
    expect(id).toMatch(/^[A-Z2-9]{4}$/);
    expect(id).not.toMatch(/[OI01]/);
  });
});

describe("claiming seats", () => {
  let id: string;
  beforeEach(async () => {
    id = await room();
  });

  it("needs the password", async () => {
    await expect(claimSeat(id, { seat: 0, password: "nope" })).rejects.toBeInstanceOf(RoomError);
  });

  it("hands out a token that identifies the seat", async () => {
    const { token, view } = await claimSeat(id, { seat: 2, password: "lotus", name: "Teja" });
    expect(token).toBeTruthy();
    expect(view.you).toEqual({ role: "player", seat: 2 });
    expect(view.players[2].occupant).toEqual({ kind: "human", name: "Teja", away: false });
  });

  it("refuses a seat that is already taken", async () => {
    await claimSeat(id, { seat: 1, password: "lotus" });
    await expect(claimSeat(id, { seat: 1, password: "lotus" })).rejects.toMatchObject({ status: 409 });
  });

  it("allows exactly one table device", async () => {
    await claimSeat(id, { seat: "table", password: "lotus" });
    await expect(claimSeat(id, { seat: "table", password: "lotus" })).rejects.toMatchObject({ status: 409 });
  });

  it("falls back to a seat label when no name is given", async () => {
    const { view } = await claimSeat(id, { seat: 3, password: "lotus", name: "   " });
    expect(view.players[3].occupant.name).toBe("Seat 4");
  });
});

describe("the lobby", () => {
  it("holds the tiles until the table deals", async () => {
    const id = await room();
    await claimSeat(id, { seat: 0, password: "lotus" });
    const waiting = await readRoom(id, null);
    expect(waiting.started).toBe(false);
    expect(waiting.players.every((p) => p.handCount === 0)).toBe(true);
    expect(waiting.wallCount).toBe(0);
  });

  it("refuses to deal a room nobody is sitting in", async () => {
    const id = await room();
    const { token } = await claimSeat(id, { seat: "table", password: "lotus" });
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
    const id = await room();
    const { token } = await claimSeat(id, { seat: 0, password: "lotus" });
    const dealt = await control(id, token, { type: "deal" });
    expect(dealt.started).toBe(true);

    const other = await room();
    const player = await claimSeat(other, { seat: 0, password: "lotus" });
    await claimSeat(other, { seat: "table", password: "lotus" });
    await expect(control(other, player.token, { type: "deal" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("holds everyone at the same starting line no matter who arrived first", async () => {
    const id = await room();
    // Kris connects, then puts the phone down while the others walk over.
    await claimSeat(id, { seat: 2, password: "lotus", name: "Kris" });
    await readRoom(id, null);
    await readRoom(id, null);
    for (const seat of [0, 1, 3] as const) {
      await claimSeat(id, { seat, password: "lotus" });
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
    const id = await room();
    const { token } = await claimSeat(id, { seat: 0, password: "lotus" });
    let view = await control(id, token, { type: "deal" });
    // Seat 0 is the dealer on the opening hand, so the turn is already here.
    expect(view.turn).toBe(0);
    const before = view.players.reduce((n, p) => n + p.discards.length, 0);
    await act(id, token, { type: "discard", tileId: view.players[0].hand[0].id });
    view = await readRoom(id, token);
    const discards = view.players.reduce((n, p) => n + p.discards.length, 0);
    expect(discards).toBeGreaterThan(before + 1);
  });
});

describe("table control", () => {
  it("refuses commands from a player", async () => {
    const id = await room();
    const { token } = await claimSeat(id, { seat: 0, password: "lotus" });
    await expect(control(id, token, { type: "restart" })).rejects.toMatchObject({ status: 403 });
  });

  it("lets the table change the faan minimum and free a seat", async () => {
    const id = await room();
    await claimSeat(id, { seat: 1, password: "lotus", name: "Parth" });
    const { token } = await claimSeat(id, { seat: "table", password: "lotus" });
    const withMin = await control(id, token, { type: "minFaan", value: 3 });
    expect(withMin.config.minFaan).toBe(3);
    const freed = await control(id, token, { type: "freeSeat", seat: 1 });
    expect(freed.players[1].occupant.kind).toBe("open");
  });

  it("restarts back to the lobby while keeping everyone seated", async () => {
    const { id, table } = await dealtRoom([0]);
    await claimSeat(id, { seat: 1, password: "lotus", name: "Kris" });
    const restarted = await control(id, table, { type: "restart" });
    expect(restarted.players[1].occupant.name).toBe("Kris");
    expect(restarted.scores).toEqual([0, 0, 0, 0]);
    // Back to the gathering screen: nobody is holding tiles until someone deals.
    expect(restarted.started).toBe(false);
    expect(restarted.players.every((p) => p.handCount === 0)).toBe(true);
    expect((await control(id, table, { type: "deal" })).handNumber).toBe(1);
  });
});

describe("the table password", () => {
  it("keeps a configured word to itself", () => {
    expect(suggestedPassword()).toBeNull();
  });

  it("falls back to a short word anyone can say aloud", async () => {
    // Three letters, and public by design — there is nothing to look up.
    expect(DEFAULT_ROOM_PASSWORD).toHaveLength(3);
    delete process.env.MAHJONG_ROOM_PASSWORD;
    try {
      expect(suggestedPassword()).toBe(DEFAULT_ROOM_PASSWORD);
      // Multiplayer works out of the box rather than answering 503.
      const { id } = await createRoom(DEFAULT_ROOM_PASSWORD);
      expect(id).toMatch(/^[A-Z2-9]{4}$/);
      await expect(createRoom("lotus")).rejects.toMatchObject({ status: 401 });
    } finally {
      process.env.MAHJONG_ROOM_PASSWORD = "lotus";
    }
  });
});

describe("playing the computer while you wait", () => {
  it("marks a solo deal as a warm-up and offers to regroup when someone joins", async () => {
    const id = await room();
    const { token } = await claimSeat(id, { seat: 0, password: "lotus", name: "Kris" });
    const solo = await control(id, token, { type: "deal" });
    expect(solo.warmup).toBe(true);
    expect(solo.seatedCount).toBe(1);
    expect(solo.canRegroup).toBe(false);

    await claimSeat(id, { seat: 2, password: "lotus", name: "Srini" });
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

describe("the join link", () => {
  it("mints a key per room and lets it stand in for the password", async () => {
    const a = await createRoom("lotus");
    const b = await createRoom("lotus");
    expect(a.joinKey).toBeTruthy();
    expect(a.joinKey).not.toBe(b.joinKey);

    const { view } = await claimSeat(a.id, { key: a.joinKey, seat: 1, name: "Srini" });
    expect(view.you).toEqual({ role: "player", seat: 1 });
    // One room's link is no good at another's table.
    await expect(claimSeat(b.id, { key: a.joinKey, seat: 1 })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("refuses a wrong key without falling back to the password", async () => {
    const { id } = await createRoom("lotus");
    await expect(claimSeat(id, { key: "not-the-key", seat: 0 })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("shows the key to the table but not to a passer-by", async () => {
    const { id, joinKey } = await createRoom("lotus");
    const { token } = await claimSeat(id, { seat: "table", password: "lotus" });
    expect((await readRoom(id, token)).joinKey).toBe(joinKey);
    expect((await readRoom(id, null)).joinKey).toBeNull();
  });
});
