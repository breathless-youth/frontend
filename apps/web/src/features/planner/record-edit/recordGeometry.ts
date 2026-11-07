import { localDateKey, localTimeOfDayMs, zonedTimeMs } from "@/lib/dateKey";
import { RecordDraftError } from "./recordDraft";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export function recordPointTime(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  dateKey: string,
  timeZone: string,
  originalMs?: number,
): number {
  const row = Math.max(
    0,
    Math.min(23, Math.floor(((point.y - rect.top) / Math.max(1, rect.height)) * 24)),
  );
  const minute = Math.ceil(
    Math.max(0, Math.min(1, (point.x - rect.left) / Math.max(1, rect.width))) * 60 -
      Number.EPSILON * 60,
  );
  return recordWallTime(dateKey, 300 + row * 60 + minute, timeZone, originalMs);
}
export function recordClock(ms: number, timeZone: string): string {
  const minute = Math.floor(localTimeOfDayMs(ms, timeZone) / MINUTE);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function recordClockTime(
  clock: string,
  dateKey: string,
  timeZone: string,
  edge: "start" | "end",
  originalMs?: number,
): number {
  const [hour, minute] = clock.split(":").map(Number);
  let wall = hour! * 60 + minute!;
  if (wall < 300 || (wall === 300 && edge === "end")) wall += 1440;
  return recordWallTime(dateKey, wall, timeZone, originalMs);
}

/** 반복되는 벽시계 시각은 임의 회차를 고르지 않는다. 손대지 않은 edge만 기존 epoch를 쓴다. */
function recordWallTime(
  dateKey: string,
  minutes: number,
  timeZone: string,
  originalMs?: number,
): number {
  const wall = Date.parse(dateKey) + minutes * MINUTE;
  const localWall = (ms: number) =>
    Date.parse(localDateKey(new Date(ms), timeZone)) + localTimeOfDayMs(ms, timeZone);
  if (originalMs !== undefined && localWall(originalMs) === wall) return originalMs;
  const candidate = zonedTimeMs(dateKey, minutes, timeZone);
  const offsets = [-24 * HOUR, 0, 24 * HOUR].map(
    (delta) => localWall(candidate + delta) - (candidate + delta),
  );
  const matches = [...new Set(offsets.map((offset) => wall - offset))].filter(
    (ms) => localWall(ms) === wall,
  );
  if (matches.length > 1) throw new RecordDraftError("ambiguous-time");
  if (matches.length === 0) throw new RecordDraftError("range");
  return matches[0]!;
}
export function recordRowRects(span: { startMs: number; endMs: number }, timeZone: string) {
  const rects: {
    row: number;
    left: number;
    width: number;
    startMs: number;
    endMs: number;
    startsBlock: boolean;
  }[] = [];
  let from = span.startMs;
  while (from < span.endMs) {
    const time = localTimeOfDayMs(from, timeZone),
      offset = time % HOUR,
      to = Math.min(span.endMs, from - offset + HOUR);
    rects.push({
      row: (Math.floor(time / HOUR) - 5 + 24) % 24,
      left: offset / HOUR,
      width: (to - from) / HOUR,
      startMs: from,
      endMs: to,
      startsBlock: from === span.startMs,
    });
    from = to;
  }
  return rects;
}
