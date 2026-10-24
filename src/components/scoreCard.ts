/**
 * The end of a game as a picture to send to a group chat: who finished where,
 * and the four facts the table talks about afterwards. The words come from
 * `scoreCard`, which the end-of-game sheet shares, so the image and the screen
 * never disagree; `drawScoreCard` lays them out on a canvas.
 */
import type { RoomView } from "@/game/room";
import { STARTING_CHIPS, describeRounds, roundsInGame } from "@/game/rules";
import { summarizeGame } from "@/game/summary";
import type { Seat } from "@/game/tiles";
import { tableName } from "@/game/tables";
import { joinNames } from "./TableResult";

export interface GameFact {
  label: string;
  value: string;
  note: string;
}

export interface ScoreCard {
  kicker: string;
  title: string;
  rows: { seat: Seat; place: number; name: string; chips: number; delta: number }[];
  facts: GameFact[];
}

/**
 * Whether the table ended the game before its last hand. A game that runs its
 * course ends as the fourth dealership of its last round passes on.
 */
export function endedEarly(view: RoomView): boolean {
  return view.phase === "gameOver" && view.dealership < 4;
}

export function signedChips(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

export function scoreCard(view: RoomView, name: (seat: Seat) => string): ScoreCard {
  const summary = summarizeGame(view.history);
  const { standings, place, chips } = summary;
  const final = (seat: Seat) => chips[seat][chips[seat].length - 1];
  const top = standings.filter((seat) => place[seat] === 1);
  const most = Math.max(...summary.thrown);
  const throwers = ([0, 1, 2, 3] as Seat[]).filter((seat) => most > 0 && summary.thrown[seat] === most);
  const biggest = summary.biggest;

  return {
    kicker: [
      endedEarly(view) ? "Game ended early" : "Game complete",
      describeRounds(roundsInGame(view.config)),
      `${summary.hands} ${summary.hands === 1 ? "hand" : "hands"}`,
      tableName(view.roomId),
    ].join(" · "),
    title:
      top.length === 1
        ? `${name(top[0])} takes the table`
        : top.length === 4
          ? "All four finish level"
          : `${joinNames(top.map(name))} share the top`,
    rows: standings.map((seat) => ({
      seat,
      place: place[seat],
      name: name(seat),
      chips: final(seat),
      delta: final(seat) - STARTING_CHIPS,
    })),
    facts: [
      {
        label: "Biggest hand",
        value: biggest ? `${biggest.faan} faan` : "—",
        note: biggest
          ? `${name(biggest.winner)}, hand ${biggest.hand}${
              biggest.pattern ? ` · ${biggest.pattern.name} ${biggest.pattern.chinese}` : ""
            }`
          : "Nobody won a hand",
      },
      {
        label: "Self-draws",
        value: String(summary.selfDraws),
        note: `of ${summary.hands - summary.washouts} wins · 自摸`,
      },
      {
        label: "Threw the most winners",
        value: most > 0 ? `${most}${throwers.length > 1 ? " each" : ""}` : "0",
        note:
          most > 0
            ? joinNames(throwers.map(name))
            : summary.hands > summary.washouts
              ? "Every win was self-drawn"
              : "Nobody won a hand",
      },
      { label: "Washouts", value: String(summary.washouts), note: `of ${summary.hands} hands · 流局` },
    ],
  };
}

export const CARD_SIZE = 1080;

/**
 * Always the default felt, whatever theme the screen is in, so the picture
 * reads the same in anybody's chat. The same values as the root theme.
 */
const CARD = {
  felt: "#0d3b2e",
  feltLight: "#14503d",
  ink: "#f4f1e8",
  dim: "#a9bdb4",
  gold: "#e8c46a",
  onGold: "#2a2110",
  panel: "rgba(0, 0, 0, 0.24)",
  line: "rgba(255, 255, 255, 0.14)",
};

/** The text cut to fit, with an ellipsis where it was cut. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Draw the card onto a square canvas `CARD_SIZE` across. */
export function drawScoreCard(canvas: HTMLCanvasElement, card: ScoreCard, font: string, date: string): boolean {
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const S = CARD_SIZE;
  const pad = 72;
  const face = (weight: number, size: number) => `${weight} ${size}px ${font}`;

  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, CARD.feltLight);
  bg.addColorStop(1, CARD.felt);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = CARD.dim;
  ctx.font = face(600, 28);
  ctx.textAlign = "left";
  ctx.fillText(fit(ctx, card.kicker, S - pad * 2), pad, pad + 28);
  ctx.fillStyle = CARD.ink;
  ctx.font = face(800, 60);
  ctx.fillText(fit(ctx, card.title, S - pad * 2), pad, pad + 108);

  // The standings, a row a seat, the chips right-aligned.
  const rowsTop = pad + 160;
  const rowH = 100;
  card.rows.forEach((row, i) => {
    const y = rowsTop + i * rowH;
    ctx.fillStyle = CARD.panel;
    ctx.beginPath();
    ctx.roundRect(pad, y, S - pad * 2, rowH - 14, 18);
    ctx.fill();
    const mid = y + (rowH - 14) / 2;
    // First place is marked by its fill and its number, never the colour alone.
    ctx.fillStyle = row.place === 1 ? CARD.gold : CARD.line;
    ctx.beginPath();
    ctx.arc(pad + 52, mid, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = row.place === 1 ? CARD.onGold : CARD.ink;
    ctx.font = face(800, 30);
    ctx.textAlign = "center";
    ctx.fillText(String(row.place), pad + 52, mid + 11);

    ctx.textAlign = "right";
    ctx.fillStyle = CARD.dim;
    ctx.font = face(600, 30);
    const deltaX = S - pad - 28;
    ctx.fillText(signedChips(row.delta), deltaX, mid + 11);
    const deltaW = Math.max(ctx.measureText("−9999").width, ctx.measureText(signedChips(row.delta)).width);
    ctx.fillStyle = CARD.ink;
    ctx.font = face(800, 44);
    const chipsX = deltaX - deltaW - 28;
    ctx.fillText(String(row.chips), chipsX, mid + 15);
    const chipsW = Math.max(ctx.measureText("9999").width, ctx.measureText(String(row.chips)).width);

    ctx.textAlign = "left";
    ctx.font = face(700, 40);
    const nameX = pad + 104;
    ctx.fillText(fit(ctx, row.name, chipsX - chipsW - 28 - nameX), nameX, mid + 14);
  });

  // The four facts, two by two.
  const factsTop = rowsTop + card.rows.length * rowH + 16;
  const gap = 20;
  const boxW = (S - pad * 2 - gap) / 2;
  const boxH = 150;
  card.facts.forEach((fact, i) => {
    const x = pad + (i % 2) * (boxW + gap);
    const y = factsTop + Math.floor(i / 2) * (boxH + gap);
    ctx.fillStyle = CARD.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = CARD.dim;
    ctx.font = face(600, 24);
    ctx.fillText(fit(ctx, fact.label, boxW - 48), x + 24, y + 40);
    ctx.fillStyle = CARD.ink;
    ctx.font = face(800, 44);
    ctx.fillText(fit(ctx, fact.value, boxW - 48), x + 24, y + 92);
    ctx.fillStyle = CARD.dim;
    ctx.font = face(500, 24);
    ctx.fillText(fit(ctx, fact.note, boxW - 48), x + 24, y + 128);
  });

  ctx.fillStyle = CARD.dim;
  ctx.font = face(500, 24);
  ctx.textAlign = "left";
  ctx.fillText("Hong Kong mahjong 麻雀", pad, S - pad + 24);
  ctx.textAlign = "right";
  ctx.fillText(date, S - pad, S - pad + 24);
  return true;
}

/** A data URL as a file, decoded in the same tick so a share stays inside the tap that asked for it. */
function dataUrlToFile(url: string, fileName: string): File {
  const [head, body] = url.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new File([bytes], fileName, { type });
}

/**
 * Hand the picture to the phone's share sheet where there is one, or save it
 * where there is not. Everything up to `navigator.share` runs synchronously:
 * Safari only lets a page share inside the tap itself.
 */
export async function shareScoreCard(
  card: ScoreCard,
  { fileName, font, date }: { fileName: string; font: string; date: string },
): Promise<"shared" | "saved" | "cancelled" | "failed"> {
  const canvas = document.createElement("canvas");
  if (!drawScoreCard(canvas, card, font, date)) return "failed";
  const url = canvas.toDataURL("image/png");
  const file = dataUrlToFile(url, fileName);
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: card.title });
      return "shared";
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return "cancelled";
      // Refused for some other reason: saving it still gets it off the screen.
    }
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  return "saved";
}

/** mahjong-table-1-20261024_1930.png: the table, and when, to the minute. */
export function cardFileName(view: RoomView, now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}_${two(now.getHours())}${two(now.getMinutes())}`;
  const table = tableName(view.roomId).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `mahjong-${table}-${stamp}.png`;
}
