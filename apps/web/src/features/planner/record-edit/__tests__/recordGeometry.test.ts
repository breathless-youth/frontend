import { expect, it } from "vitest";
import { recordClockTime, recordPointTime, recordRowRects } from "../recordGeometry";
it("정확한 31분 위치의 부동소수점 오차는 올리지 않고 실제 부분 분만 올린다", () => {
  const rect = { left: 0, top: 0, width: 600, height: 672 };
  expect(recordPointTime({ x: 310, y: 122 }, rect, "2026-11-04", "Asia/Seoul")).toBe(
    Date.parse("2026-11-04T00:31:00Z"),
  );
  expect(recordPointTime({ x: 310.0001, y: 122 }, rect, "2026-11-04", "Asia/Seoul")).toBe(
    Date.parse("2026-11-04T00:32:00Z"),
  );
});

it.each([
  ["22시 30분", "2026-11-03T13:30:00Z", 17, 29 / 60],
  ["다음 날 자정", "2026-11-03T15:00:00Z", 18, 59 / 60],
  ["다음 날 05시 창 끝", "2026-11-03T20:00:00Z", 23, 59 / 60],
  ["05시 경계", "2026-11-02T20:00:00Z", 23, 59 / 60],
])("%s로 올림된 점의 손잡이는 직전 1분 표시 영역을 사용한다", (_, iso, row, left) => {
  const point = Date.parse(iso);
  const span = Object.freeze({ startMs: point, endMs: point });
  const rects = recordRowRects(span, "Asia/Seoul");
  expect(rects).toHaveLength(1);
  expect(rects[0]).toMatchObject({
    row,
    left,
    startMs: point - 60_000,
    endMs: point,
    startsBlock: true,
  });
  expect(rects[0]!.width).toBeCloseTo(1 / 60);
  expect(span).toEqual({ startMs: point, endMs: point });
});

it("역전된 구간에는 표시 영역을 만들지 않는다", () => {
  const endMs = Date.parse("2026-11-03T13:30:00Z");
  expect(recordRowRects({ startMs: endMs + 1, endMs }, "Asia/Seoul")).toEqual([]);
});

it("양수 길이의 구간은 자정 전후의 원래 길이와 행을 유지한다", () => {
  const span = {
    startMs: Date.parse("2026-11-03T14:59:00Z"),
    endMs: Date.parse("2026-11-03T15:01:00Z"),
  };
  const rects = recordRowRects(span, "Asia/Seoul");
  expect(rects).toHaveLength(2);
  expect(rects[0]).toMatchObject({
    row: 18,
    left: 59 / 60,
    startMs: span.startMs,
    endMs: span.startMs + 60_000,
    startsBlock: true,
  });
  expect(rects[1]).toMatchObject({
    row: 19,
    left: 0,
    startMs: span.endMs - 60_000,
    endMs: span.endMs,
    startsBlock: false,
  });
  expect(rects[0]!.width + rects[1]!.width).toBeCloseTo(2 / 60);
});
it("10분 눈금 안에서 끌어도 1분 올림 위치를 반환한다", () => {
  const rect = { left: 0, top: 0, width: 600, height: 600 };
  expect(recordPointTime({ x: 130, y: 110 }, rect, "2026-11-05", "Asia/Seoul")).toBe(
    Date.parse("2026-11-05T00:13:00Z"),
  );
  expect(recordPointTime({ x: 130.1, y: 110 }, rect, "2026-11-05", "Asia/Seoul")).toBe(
    Date.parse("2026-11-05T00:14:00Z"),
  );
  expect(recordPointTime({ x: 600, y: 599 }, rect, "2026-11-05", "Asia/Seoul")).toBe(
    Date.parse("2026-11-05T20:00:00Z"),
  );
});

it("두 번째 DST 시각은 바꾸지 않은 벽시계 입력과 포인터에서 기존 epoch를 보존한다", () => {
  const end = Date.parse("2026-11-01T06:40:00Z");
  expect(recordClockTime("01:40", "2026-10-31", "America/New_York", "end", end)).toBe(end);
  expect(
    recordPointTime(
      { x: 400, y: 566 },
      { left: 0, top: 0, width: 600, height: 672 },
      "2026-10-31",
      "America/New_York",
      end,
    ),
  ).toBe(end);
});

it("새로 입력하거나 끈 모호한 DST 시각은 첫 번째 회차로 조용히 바꾸지 않는다", () => {
  expect(() => recordClockTime("01:30", "2026-10-31", "America/New_York", "end")).toThrow(
    "ambiguous-time",
  );
  expect(() =>
    recordPointTime(
      { x: 300, y: 566 },
      { left: 0, top: 0, width: 600, height: 672 },
      "2026-10-31",
      "America/New_York",
    ),
  ).toThrow("ambiguous-time");
  expect(recordClockTime("02:10", "2026-10-31", "America/New_York", "end")).toBe(
    Date.parse("2026-11-01T07:10:00Z"),
  );
});
