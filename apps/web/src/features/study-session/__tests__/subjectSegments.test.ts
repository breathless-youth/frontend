import { describe, expect, it } from "vitest";

import type { StatusEventPayload } from "@focusmakers/types";

import { clampSubjectSegments } from "../sessionRequestClamp";
import {
  createSubjectSegmentTracker,
  deriveSubjectTotals,
  liveSubjectTime,
  materializeSubjectSegments,
  selectSubjectSegment,
} from "../subjectSegments";

const T0 = Date.UTC(2026, 8, 22, 1, 0, 0);
const at = (sec: number) => T0 + sec * 1000;
const iso = (sec: number) => new Date(at(sec)).toISOString();
const seg = (subjectId: number, fromSec: number, toSec: number) => ({
  subjectId,
  startedAt: iso(fromSec),
  endedAt: iso(toSec),
});
const event = (status: StatusEventPayload["status"], fromSec: number, toSec: number) => ({
  status,
  startedAt: iso(fromSec),
  endedAt: iso(toSec),
});

describe("subjectSegments — 과목 전환 시각을 구간으로 남긴다", () => {
  it("선택 없이 흐른 시간은 어느 구간에도 들지 않는다", () => {
    expect(materializeSubjectSegments(createSubjectSegmentTracker(), at(600))).toEqual([]);
  });

  it("전환 시점에 이전 구간이 닫히고 새 구간이 열린다 — 지금 구간은 경계에서 닫아 보낸다", () => {
    let tracker = createSubjectSegmentTracker();
    tracker = selectSubjectSegment(tracker, 1, at(100));
    tracker = selectSubjectSegment(tracker, 2, at(400));

    expect(materializeSubjectSegments(tracker, at(1000))).toEqual([
      seg(1, 100, 400),
      seg(2, 400, 1000),
    ]);
  });

  it("같은 과목을 다시 고르면 아무 일도 없고, 다른 과목 뒤에 다시 고르면 새 구간이 생긴다", () => {
    let tracker = createSubjectSegmentTracker();
    tracker = selectSubjectSegment(tracker, 1, at(0));
    const same = selectSubjectSegment(tracker, 1, at(50));
    expect(same).toBe(tracker);

    tracker = selectSubjectSegment(tracker, 2, at(100));
    tracker = selectSubjectSegment(tracker, 1, at(300));
    expect(materializeSubjectSegments(tracker, at(500))).toEqual([
      seg(1, 0, 100),
      seg(2, 100, 300),
      seg(1, 300, 500),
    ]);
  });

  it("선택 해제 뒤의 시간은 구간이 없고, 고른 직후 경계가 같으면 0초 구간을 만들지 않는다", () => {
    let tracker = createSubjectSegmentTracker();
    tracker = selectSubjectSegment(tracker, 1, at(100));
    tracker = selectSubjectSegment(tracker, null, at(100));
    expect(materializeSubjectSegments(tracker, at(900))).toEqual([]);

    tracker = selectSubjectSegment(tracker, 3, at(900));
    expect(materializeSubjectSegments(tracker, at(900))).toEqual([]);
    expect(materializeSubjectSegments(tracker, at(901))).toEqual([seg(3, 900, 901)]);
  });

  it("복원: 마지막 구간의 끝이 resumeAt과 같으면 그 과목이 resumeAt부터 다시 열린다", () => {
    const tracker = createSubjectSegmentTracker([seg(2, 300, 500), seg(1, 0, 300)], at(500));

    expect(tracker.current).toEqual({ subjectId: 2, startedAtMs: at(500) });
    expect(materializeSubjectSegments(tracker, at(600))).toEqual([
      seg(1, 0, 300),
      seg(2, 300, 500),
      seg(2, 500, 600),
    ]);
  });

  it("복원: 마지막 구간의 끝과 resumeAt 사이에 틈이 있으면 죽기 전에 이미 선택 해제한 것이라 다시 열지 않는다", () => {
    // 과목 2를 500에 스스로 선택 해제하고 선택 없이 공부하다 죽었고, 마지막 보고 시각은 560이다.
    const tracker = createSubjectSegmentTracker([seg(2, 300, 500), seg(1, 0, 300)], at(560));

    expect(tracker.current).toBeNull();
    expect(materializeSubjectSegments(tracker, at(600))).toEqual([
      seg(1, 0, 300),
      seg(2, 300, 500),
    ]);
  });

  it("복원: 선택 해제 뒤 죽은 시나리오를 선택 흐름 그대로 재생해도 다시 열리지 않는다", () => {
    let tracker = createSubjectSegmentTracker();
    tracker = selectSubjectSegment(tracker, 1, at(0));
    tracker = selectSubjectSegment(tracker, null, at(500)); // 죽기 전에 스스로 해제
    const reportedAt = at(560); // 선택 없이 공부하다 죽은 뒤의 마지막 보고 시각
    const sent = materializeSubjectSegments(tracker, reportedAt);

    const revived = createSubjectSegmentTracker(sent, reportedAt);
    expect(revived.current).toBeNull();
  });

  it("복원 시각이 없으면 선택 없이 시작한다", () => {
    expect(createSubjectSegmentTracker([seg(1, 0, 300)]).current).toBeNull();
  });

  it("deriveSubjectTotals — PAUSE 겹침은 둘 다에서, 다른 이벤트 겹침은 순공에서만 빠진다", () => {
    const totals = deriveSubjectTotals(
      [seg(1, 0, 600), seg(2, 600, 900), seg(1, 900, 1000)],
      [event("PAUSE", 100, 160), event("PHONE", 500, 650), event("AWAY", 950, 990)],
    );

    // 과목 1: 600초 − PAUSE 60 = 540 총공부, − PHONE 겹침 100 − AWAY 40 = 400 순공 (두 구간 합)
    expect(liveSubjectTime(totals, 1)).toEqual({ studySec: 540 + 100, focusSec: 440 + 60 });
    // 과목 2: 300초, PHONE 겹침 50 → 순공 250
    expect(liveSubjectTime(totals, 2)).toEqual({ studySec: 300, focusSec: 250 });
    expect(liveSubjectTime(totals, 9)).toEqual({ studySec: 0, focusSec: 0 });
  });

  it("clampSubjectSegments — 세션 밖은 잘라내고, 0초는 버리고, 겹치는 시작은 앞 구간 끝으로 민다", () => {
    expect(
      clampSubjectSegments(
        [seg(2, 500, 800), seg(1, -100, 550), seg(3, 800, 800), seg(4, 900, 2000)],
        at(0),
        at(1000),
      ),
    ).toEqual([seg(1, 0, 550), seg(2, 550, 800), seg(4, 900, 1000)]);
  });

  it("clampSubjectSegments — 읽을 수 없는 시각은 버린다", () => {
    expect(
      clampSubjectSegments([{ subjectId: 1, startedAt: "nope", endedAt: iso(10) }], at(0), at(100)),
    ).toEqual([]);
  });
});
