import { describe, expect, it } from "vitest";

import { clampSubjectTimes } from "../sessionRequestClamp";
import {
  createSubjectTimeTracker,
  liveSubjectTime,
  materializeSubjectTimes,
  selectSubjectTime,
} from "../subjectTimes";

const t = (studySec: number, focusSec: number) => ({ studySec, focusSec });

describe("subjectTimes — 세션 타이머에서 항목별 시간을 파생한다", () => {
  it("선택 없이 흐른 시간은 어느 항목에도 쌓이지 않는다", () => {
    const tracker = createSubjectTimeTracker();
    expect(materializeSubjectTimes(tracker, t(600, 500))).toEqual([]);
  });

  it("전환 시점의 타이머 차이가 이전 항목에 얹히고 새 항목이 이어받는다", () => {
    let tracker = createSubjectTimeTracker();
    tracker = selectSubjectTime(tracker, { subjectId: 1, taskId: null }, t(100, 100));
    tracker = selectSubjectTime(tracker, { subjectId: 1, taskId: 7 }, t(400, 350));
    // 두 번째 항목이 진행 중인 채로 스냅샷
    expect(materializeSubjectTimes(tracker, t(1000, 800))).toEqual([
      { subjectId: 1, taskId: null, studySec: 300, focusSec: 250 },
      { subjectId: 1, taskId: 7, studySec: 600, focusSec: 450 },
    ]);
    // 과목 전체 = 과목만 선택분 + 할 일 선택분
    expect(liveSubjectTime(materializeSubjectTimes(tracker, t(1000, 800)), 1, null)).toEqual(
      t(900, 700),
    );
  });

  it("같은 항목을 다시 고르면 한 건으로 합쳐지고 항목은 끝으로 간다", () => {
    let tracker = createSubjectTimeTracker();
    tracker = selectSubjectTime(tracker, { subjectId: 1, taskId: null }, t(0, 0));
    tracker = selectSubjectTime(tracker, { subjectId: 2, taskId: null }, t(100, 100));
    tracker = selectSubjectTime(tracker, { subjectId: 1, taskId: null }, t(300, 200));
    expect(materializeSubjectTimes(tracker, t(500, 400))).toEqual([
      { subjectId: 2, taskId: null, studySec: 200, focusSec: 100 },
      { subjectId: 1, taskId: null, studySec: 300, focusSec: 300 },
    ]);
  });

  it("선택 해제 뒤의 시간은 쌓이지 않고, 0초 항목은 빠진다(진행 중 선택만 남는다)", () => {
    let tracker = createSubjectTimeTracker();
    tracker = selectSubjectTime(tracker, { subjectId: 1, taskId: null }, t(100, 100));
    tracker = selectSubjectTime(tracker, null, t(100, 100));
    expect(materializeSubjectTimes(tracker, t(900, 900))).toEqual([]);
    tracker = selectSubjectTime(tracker, { subjectId: 3, taskId: null }, t(900, 900));
    expect(materializeSubjectTimes(tracker, t(900, 900))).toEqual([
      { subjectId: 3, taskId: null, studySec: 0, focusSec: 0 },
    ]);
  });

  it("복원: 마지막 항목이 지금 선택이 되고 복원 시점 누적값부터의 차이만 그 항목에 얹힌다", () => {
    const tracker = createSubjectTimeTracker(
      [
        { subjectId: 1, taskId: null, studySec: 300, focusSec: 300 },
        { subjectId: 2, taskId: 5, studySec: 200, focusSec: 150 },
      ],
      t(1000, 900),
    );
    expect(tracker.current?.selection).toEqual({ subjectId: 2, taskId: 5 });
    expect(materializeSubjectTimes(tracker, t(1060, 950))).toEqual([
      { subjectId: 1, taskId: null, studySec: 300, focusSec: 300 },
      { subjectId: 2, taskId: 5, studySec: 260, focusSec: 200 },
    ]);
  });

  it("clampSubjectTimes — 항목 합이 세션 studySec을 넘지 않고 focus ≤ study를 지킨다", () => {
    expect(
      clampSubjectTimes(
        [
          { subjectId: 1, taskId: null, studySec: 400, focusSec: 500 },
          { subjectId: 2, taskId: null, studySec: 400, focusSec: 100 },
        ],
        600,
      ),
    ).toEqual([
      { subjectId: 1, taskId: null, studySec: 400, focusSec: 400 },
      { subjectId: 2, taskId: null, studySec: 200, focusSec: 100 },
    ]);
  });
});
