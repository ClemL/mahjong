import { describe, expect, it } from "vitest";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { GET } = await import("../route");
const { claimSeat } = await import("@/server/rooms");
const { roomStore } = await import("@/server/store");

const context = { params: Promise.resolve({ id: "TABLE3" }) };

async function seated(): Promise<string> {
  await roomStore().delete("TABLE3");
  return (await claimSeat("TABLE3", { seat: 2 })).token;
}

async function roleFor(request: Request): Promise<string> {
  const body = (await (await GET(request, context)).json()) as { you: { role: string } };
  return body.you.role;
}

describe("reading the room", () => {
  it("takes the seat token from the Authorization header", async () => {
    const token = await seated();
    const request = new Request("http://test/api/rooms/TABLE3", { headers: { Authorization: `Bearer ${token}` } });
    expect(await roleFor(request)).toBe("player");
  });

  it("still accepts it in the query string from a page loaded before the header", async () => {
    const token = await seated();
    expect(await roleFor(new Request(`http://test/api/rooms/TABLE3?token=${token}`))).toBe("player");
  });

  it("treats a request with neither as a spectator", async () => {
    await seated();
    expect(await roleFor(new Request("http://test/api/rooms/TABLE3"))).toBe("spectator");
  });

  it("answers a poll with nothing new as unchanged", async () => {
    const token = await seated();
    const headers = { Authorization: `Bearer ${token}` };
    const first = (await (await GET(new Request("http://test/api/rooms/TABLE3", { headers }), context)).json()) as {
      version: number;
    };
    const again = await GET(new Request(`http://test/api/rooms/TABLE3?since=${first.version}`, { headers }), context);
    expect(await again.json()).toEqual({ version: first.version, unchanged: true });
  });
});
