import { beforeEach, describe, expect, it } from "vitest";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { FIXED_ROOM_ID, RoomError, act, claimSeat, control, passwordRequired, readRoom } =
  await import("../rooms");
const { roomStore } = await import("../store");

const ID = FIXED_ROOM_ID;

beforeEach(async () => {
  // One shared table, so each test starts from a fresh deal.
  await roomStore().delete(ID);
});

describe("the single table", () => {
  it("needs no password for now", () => {
    expect(passwordRequired()).toBe(false);
  });

  it("is dealt on first arrival rather than created by hand", async () => {
    const view = await readRoom(ID, null);
    expect(view.roomId).toBe(ID);
    expect(view.handNumber).toBe(1);
    expect(view.players.every((p) => p.occupant.kind === "open")).toBe(true);
  });

  it("serves the same table to everyone", async () => {
    await claimSeat(ID, { seat: 0, password: "", name: "Kris" });
    const second = await readRoom(ID, null);
    expect(second.players[0].occupant.name).toBe("Kris");
  });

  it("refuses any other room id", async () => {
    await expect(readRoom("XYZW", null)).rejects.toMatchObject({ status: 404 });
    await expect(claimSeat("XYZW", { seat: 0, password: "" })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("claiming seats", () => {
  it("seats anyone who asks", async () => {
    const { token, view } = await claimSeat(ID, { seat: 2, password: "", name: "Teja" });
    expect(token).toBeTruthy();
    expect(view.you).toEqual({ role: "player", seat: 2 });
    expect(view.players[2].occupant).toEqual({ kind: "human", name: "Teja", away: false });
  });

  it("refuses a seat that is already taken", async () => {
    await claimSeat(ID, { seat: 1, password: "" });
    await expect(claimSeat(ID, { seat: 1, password: "" })).rejects.toMatchObject({ status: 409 });
  });

  it("allows exactly one table device", async () => {
    await claimSeat(ID, { seat: "table", password: "" });
    await expect(claimSeat(ID, { seat: "table", password: "" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("falls back to a seat label when no name is given", async () => {
    const { view } = await claimSeat(ID, { seat: 3, password: "", name: "   " });
    expect(view.players[3].occupant.name).toBe("Seat 4");
  });
});

describe("playing", () => {
  it("rejects an action from someone with no seat", async () => {
    await expect(act(ID, "not-a-token", { type: "win" })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a discard when it is not your turn", async () => {
    const east = await claimSeat(ID, { seat: 0, password: "" });
    const south = await claimSeat(ID, { seat: 1, password: "" });
    const view = await readRoom(ID, east.token);
    if (view.phase !== "action") return;
    const offTurn = view.turn === 0 ? south.token : east.token;
    await expect(act(ID, offTurn, { type: "discard", tileId: "whatever" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("lets the seated player discard on their turn", async () => {
    let view = await readRoom(ID, null);
    const { token } = await claimSeat(ID, { seat: view.turn, password: "" });
    view = await readRoom(ID, token);
    expect(view.actions?.canDiscard).toBe(true);
    const seat = view.you.seat!;
    const tile = view.players[seat].hand[0];
    const after = await act(ID, token, { type: "discard", tileId: tile.id });
    expect(after.version).toBeGreaterThan(view.version);
  });

  it("fills unclaimed seats with the computer and keeps play moving", async () => {
    let view = await readRoom(ID, null);
    const { token } = await claimSeat(ID, { seat: view.turn, password: "" });
    view = await readRoom(ID, token);
    const seat = view.you.seat!;
    const before = view.players.reduce((n, p) => n + p.discards.length, 0);
    await act(ID, token, { type: "discard", tileId: view.players[seat].hand[0].id });
    const after = await readRoom(ID, token);
    expect(after.players.reduce((n, p) => n + p.discards.length, 0)).toBeGreaterThan(before + 1);
  });
});

describe("table control", () => {
  it("refuses commands from a player", async () => {
    const { token } = await claimSeat(ID, { seat: 0, password: "" });
    await expect(control(ID, token, { type: "restart" })).rejects.toMatchObject({ status: 403 });
    expect(RoomError).toBeDefined();
  });

  it("lets the table change the faan minimum and free a seat", async () => {
    await claimSeat(ID, { seat: 1, password: "", name: "Parth" });
    const { token } = await claimSeat(ID, { seat: "table", password: "" });
    expect((await control(ID, token, { type: "minFaan", value: 3 })).config.minFaan).toBe(3);
    expect((await control(ID, token, { type: "freeSeat", seat: 1 })).players[1].occupant.kind).toBe(
      "open",
    );
  });

  it("restarts the game while keeping everyone seated", async () => {
    await claimSeat(ID, { seat: 0, password: "", name: "Kris" });
    const { token } = await claimSeat(ID, { seat: "table", password: "" });
    const restarted = await control(ID, token, { type: "restart" });
    expect(restarted.players[0].occupant.name).toBe("Kris");
    expect(restarted.scores).toEqual([0, 0, 0, 0]);
    expect(restarted.handNumber).toBe(1);
  });
});
