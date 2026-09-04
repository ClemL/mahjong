import { beforeEach, describe, expect, it } from "vitest";

process.env.MAHJONG_ROOM_PASSWORD = "lotus";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { RoomError, act, claimSeat, control, createRoom, readRoom } = await import("../rooms");

async function room(): Promise<string> {
  return (await createRoom("lotus")).id;
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
    expect(view.players[2].occupant).toEqual({ kind: "human", name: "Teja" });
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

describe("playing", () => {
  it("rejects an action from someone with no seat", async () => {
    const id = await room();
    await expect(act(id, "not-a-token", { type: "win" })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a discard when it is not your turn", async () => {
    const id = await room();
    // Two people, so play stops at one of them and the other is off turn.
    const east = await claimSeat(id, { seat: 0, password: "lotus" });
    const south = await claimSeat(id, { seat: 1, password: "lotus" });
    const view = await readRoom(id, east.token);
    if (view.phase !== "action") return;
    const offTurn = view.turn === 0 ? south.token : east.token;
    await expect(act(id, offTurn, { type: "discard", tileId: "whatever" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("lets the seated player discard on their turn", async () => {
    const id = await room();
    let view = await readRoom(id, null);
    const { token } = await claimSeat(id, { seat: view.turn, password: "lotus" });
    view = await readRoom(id, token);
    expect(view.actions?.canDiscard).toBe(true);
    const seat = view.you.seat!;
    const tile = view.players[seat].hand[0];
    const after = await act(id, token, { type: "discard", tileId: tile.id });
    expect(after.version).toBeGreaterThan(view.version);
  });

  it("fills unclaimed seats with the computer and keeps play moving", async () => {
    const id = await room();
    let view = await readRoom(id, null);
    const { token } = await claimSeat(id, { seat: view.turn, password: "lotus" });
    view = await readRoom(id, token);
    const seat = view.you.seat!;
    const before = view.players.reduce((n, p) => n + p.discards.length, 0);
    await act(id, token, { type: "discard", tileId: view.players[seat].hand[0].id });
    const after = await readRoom(id, token);
    const discards = after.players.reduce((n, p) => n + p.discards.length, 0);
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

  it("restarts the game while keeping everyone seated", async () => {
    const id = await room();
    await claimSeat(id, { seat: 0, password: "lotus", name: "Kris" });
    const { token } = await claimSeat(id, { seat: "table", password: "lotus" });
    const restarted = await control(id, token, { type: "restart" });
    expect(restarted.players[0].occupant.name).toBe("Kris");
    expect(restarted.scores).toEqual([0, 0, 0, 0]);
    expect(restarted.handNumber).toBe(1);
  });
});
