import { expect, it } from "vitest";
import { recordClockTime, recordPointTime } from "../recordGeometry";
it("정확한 31분 위치의 부동소수점 오차는 올리지 않고 실제 부분 분만 올린다", () => {
  const rect = { left: 0, top: 0, width: 600, height: 672 };
  expect(recordPointTime({ x: 310, y: 122 }, rect, "2026-11-04", "Asia/Seoul")).toBe(
    Date.parse("2026-11-04T00:31:00Z"),
  );
  expect(recordPointTime({ x: 310.0001, y: 122 }, rect, "2026-11-04", "Asia/Seoul")).toBe(
    Date.parse("2026-11-04T00:32:00Z"),
  );
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
