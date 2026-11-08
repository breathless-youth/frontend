import { expect, it } from "vitest";
import { recordPieceMinutes } from "../recordMinutes";

const start = Date.parse("2026-11-09T03:00:00Z");
const window = { startMs: start, endMs: start + 180_000 };
const piece = (from: string, to: string, subjectId: number | null) => ({
  startedAt: `2026-11-09T03:${from}Z`,
  endedAt: `2026-11-09T03:${to}Z`,
  subjectId,
});

it.each([
  {
    pieces: [piece("00:00", "00:20", 1), piece("00:20", "00:40", 2), piece("00:40", "01:00", 3)],
    want: 3,
  },
  {
    pieces: [piece("00:00", "00:30", 1), piece("00:30", "00:50", 2), piece("00:50", "01:00", 3)],
    want: 1,
  },
  {
    pieces: [piece("00:00", "00:20", 1), piece("00:20", "00:40", 2), piece("00:40", "01:00", 1)],
    want: 1,
  },
  { pieces: [piece("00:00", "00:20", 1), piece("00:20", "00:41", null)], want: null },
])("과목별 실제 길이를 합산하고 동률이면 늦게 끝난 과목을 고른다: $want", ({ pieces, want }) => {
  const expected = [{ startMs: start, endMs: start + 60_000, subjectId: want }];
  expect(recordPieceMinutes(pieces, window)).toEqual(expected);
  expect(recordPieceMinutes([...pieces].reverse(), window)).toEqual(expected);
});

it("밀리초 아래의 길이 차이를 버려 잘못된 동률을 만들지 않는다", () => {
  expect(
    recordPieceMinutes(
      [
        piece("00:00.000000000", "00:30.000000001", 1),
        piece("00:30.000000001", "01:00.000000000", 2),
      ],
      window,
    )[0]?.subjectId,
  ).toBe(1);
});

it("각 분으로 자른 종료 시각으로 동률을 판정하고 빈 분을 만들지 않는다", () => {
  expect(
    recordPieceMinutes(
      [piece("00:10", "00:20", 1), piece("00:30", "00:40", 2), piece("02:00", "02:37.5", null)],
      window,
    ),
  ).toEqual([
    { startMs: start, endMs: start + 60_000, subjectId: 2 },
    { startMs: start + 120_000, endMs: start + 180_000, subjectId: null },
  ]);
  expect(recordPieceMinutes([], window)).toEqual([]);
});

it("조회 창 밖 조각을 제외하고 양끝을 분과 조회 창의 교집합으로 자른다", () => {
  expect(
    recordPieceMinutes([piece("00:00", "03:00", 1)], {
      startMs: start + 30_000,
      endMs: start + 90_000,
    }),
  ).toEqual([
    { startMs: start + 30_000, endMs: start + 60_000, subjectId: 1 },
    { startMs: start + 60_000, endMs: start + 90_000, subjectId: 1 },
  ]);
});
