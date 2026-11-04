/**
 * 기기 시간대 날짜 키와 하루 경계
 *
 * 서버는 요청에 실린 기기 시간대로 통계 날짜(statDate)를 정하므로 앱도 같은 시간대로 날짜를 센다.
 * 랭킹만 한국 시간 기준이라 `KOREA_TIME_ZONE`을 넘겨 부른다.
 * 서머타임이 있는 시간대는 하루가 23시간이나 25시간이라 고정 오프셋이나 24시간 더하기로 경계를 구하지 않는다.
 */

export const KOREA_TIME_ZONE = "Asia/Seoul";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// 문서를 연 뒤에는 시간대가 바뀌지 않는다고 보고 기본 포맷터 하나에서 읽는다.
const deviceFormat = new Intl.DateTimeFormat();

/** 기기 시간대 IANA 이름. 엔진이 값을 주지 않으면 서울이다. */
export function deviceTimeZone(): string {
  return deviceFormat.resolvedOptions().timeZone || KOREA_TIME_ZONE;
}

const partFormats = new Map<string, Intl.DateTimeFormat>();

function wallClockParts(ms: number, timeZone: string): Record<string, number> {
  let format = partFormats.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    partFormats.set(timeZone, format);
  }
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(ms)) {
    parts[part.type] = Number(part.value);
  }
  return parts;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 그 시각의 `YYYY-MM-DD`. 기본은 기기 시간대다. */
export function localDateKey(at: Date = new Date(), timeZone: string = deviceTimeZone()): string {
  const { year, month, day } = wallClockParts(at.getTime(), timeZone);
  return `${year}-${pad2(month!)}-${pad2(day!)}`;
}

/** 그 시각의 벽시계가 그날 자정부터 지난 ms. 서머타임 전환일에도 벽시계 그대로다. */
export function localTimeOfDayMs(ms: number, timeZone: string = deviceTimeZone()): number {
  const { hour, minute, second } = wallClockParts(ms, timeZone);
  return ((hour! % 24) * 60 + minute!) * MINUTE_MS + second! * 1000 + (((ms % 1000) + 1000) % 1000);
}

/** 그 시각의 벽시계를 UTC로 읽은 값과 실제 시각의 차이. */
function offsetMs(ms: number, timeZone: string): number {
  const { year, month, day, hour, minute, second } = wallClockParts(ms, timeZone);
  // 일부 엔진은 h23을 줘도 자정을 24시로 낸다.
  const wall = Date.UTC(year!, month! - 1, day!, hour! % 24, minute!, second!);
  return wall - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * 날짜 키의 벽시계 시각(자정부터 분)에 해당하는 epoch ms
 *
 * 하루 앞뒤의 오프셋으로 후보 둘을 구해 그 벽시계가 맞는 쪽을 고른다.
 * 서머타임이 끝나 두 번 오는 시각은 둘 다 맞아 먼저 오는 쪽(앞 오프셋)이다.
 * 서머타임이 시작해 건너뛴 시각은 둘 다 틀려 앞 오프셋으로 읽으므로 건너뛴 만큼 늦어진다(02:30 → 03:30).
 */
export function zonedTimeMs(
  dateKey: string,
  minutes: number,
  timeZone: string = deviceTimeZone(),
): number {
  const wall = Date.parse(dateKey) + minutes * MINUTE_MS;
  const before = wall - offsetMs(wall - DAY_MS, timeZone);
  const after = wall - offsetMs(wall + DAY_MS, timeZone);
  const matches = (ms: number) => ms + offsetMs(ms, timeZone) === wall;
  return matches(before) || !matches(after) ? before : after;
}

/** 날짜 키의 자정 epoch ms. 다음 날 자정은 다음 날짜 키로 구한다. */
export function dayStartMs(dateKey: string, timeZone: string = deviceTimeZone()): number {
  return zonedTimeMs(dateKey, 0, timeZone);
}
