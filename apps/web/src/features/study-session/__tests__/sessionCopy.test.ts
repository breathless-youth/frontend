import { describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

import { exitConfirmDescription } from "../formatDuration";
import type { PauseTrigger, SessionState } from "../sessionState";
import {
  FOCUS_STATE,
  autoEndBodyKey,
  distractionState,
  pauseState,
  statusLabelKey,
  toEventStatus,
} from "../sessionState";

// 문구 상수 파일(sessionCopy.ts)이 카탈로그로 바뀌어, 예전 상수와 같은 모양을 호출 시점에 만들어 단언한다.
const statusCopyFor = (state: SessionState) => ({ label: i18n.t(statusLabelKey(state)) });
const exitConfirmCopy = () => ({
  title: i18n.t("study-session:exitConfirm.title"),
  cancel: i18n.t("study-session:exitConfirm.cancel"),
  confirm: i18n.t("study-session:exitConfirm.confirm"),
});
const NO_FOCUS_EXIT_DESCRIPTION = "1분 미만 공부는 기록에 표시되지 않아요";
const autoEndBodyLinesFor = (trigger: PauseTrigger) => {
  const key = autoEndBodyKey(trigger);
  return key === null ? null : i18n.t(key).split("\n");
};
const autoEndCopy = () => ({
  title: i18n.t("study-session:autoEnd.title"),
  summaryLabels: {
    focusSec: i18n.t("study-session:autoEnd.focusLabel"),
    studySec: i18n.t("study-session:autoEnd.studyLabel"),
  },
  cta: i18n.t("study-session:autoEnd.cta"),
});

describe("statusCopyFor — voice-tone.md §3 상태 문구", () => {
  it("집중 문구를 낸다", () => {
    expect(statusCopyFor(FOCUS_STATE)).toEqual({ label: "순공시간 측정 중" });
  });

  it("비집중은 원인과 상관없이 같은 문구를 쓴다", () => {
    for (const trigger of ["AWAY", "PHONE", "DEVICE", "SLEEP"] as const) {
      expect(statusCopyFor(distractionState(trigger))).toEqual({ label: "자리를 확인해 주세요" });
    }
  });

  it("수동 일시정지와 화면 꺼짐은 같은 문구를 쓴다 — '화면 꺼짐'은 별도 유형이 아니다", () => {
    expect(statusCopyFor(pauseState("BACKGROUND"))).toEqual(statusCopyFor(pauseState("MANUAL")));
  });

  it("일시정지 문구를 낸다", () => {
    expect(statusCopyFor(pauseState("MANUAL"))).toEqual({ label: "측정을 일시정지했어요" });
  });
});

describe("toEventStatus — 화면 상태 ↔ StudyEventStatus 매핑", () => {
  it("집중은 이벤트로 기록하지 않는다", () => {
    expect(toEventStatus(FOCUS_STATE)).toBeNull();
  });

  it("감지 트리거는 그대로 서버 status가 된다", () => {
    expect(toEventStatus(distractionState("AWAY"))).toBe("AWAY");
    expect(toEventStatus(distractionState("PHONE"))).toBe("PHONE");
    expect(toEventStatus(distractionState("DEVICE"))).toBe("DEVICE");
  });

  it("일시정지는 트리거와 무관하게 PAUSE 하나다", () => {
    expect(toEventStatus(pauseState("MANUAL"))).toBe("PAUSE");
    expect(toEventStatus(pauseState("BACKGROUND"))).toBe("PAUSE");
  });

  it("졸음은 서버에 SLEEP으로 나간다", () => {
    expect(toEventStatus(distractionState("SLEEP"))).toBe("SLEEP");
  });
});

describe("EXIT_CONFIRM_COPY — S3-7 종료 확인 (voice-tone.md §4)", () => {
  it("확정 문구를 그대로 쓴다", () => {
    expect(exitConfirmCopy()).toEqual({
      title: "공부를 종료할까요?",
      cancel: "계속하기",
      confirm: "공부 종료",
    });
  });

  it("파괴적 액션 라벨을 '종료'로 축약하지 않는다 — 색만으로는 파괴성이 구분되지 않는다", () => {
    expect(exitConfirmCopy().confirm).toBe("공부 종료");
  });
});

describe("exitConfirmDescription — 한글 시간 길이 + 미달 분기", () => {
  it("1분 이상이면 저장을 약속한다", () => {
    expect(exitConfirmDescription(5048)).toBe("지금까지 집중한 1시간 24분은 저장돼요");
    expect(exitConfirmDescription(3120)).toBe("지금까지 집중한 52분은 저장돼요");
    expect(exitConfirmDescription(60)).toBe("지금까지 집중한 1분은 저장돼요");
  });

  it("1분 미만이면 초 단위로 저장을 약속한다", () => {
    expect(exitConfirmDescription(59)).toBe("지금까지 집중한 59초는 저장돼요");
    expect(exitConfirmDescription(30)).toBe("지금까지 집중한 30초는 저장돼요");
    expect(exitConfirmDescription(1)).toBe("지금까지 집중한 1초는 저장돼요");
  });

  it("순공이 0초면 저장을 약속하지 않는다", () => {
    expect(exitConfirmDescription(0)).toBe(NO_FOCUS_EXIT_DESCRIPTION);
    expect(exitConfirmDescription(0)).not.toContain("저장돼요");
  });

  it("어떤 값에도 HH:MM:SS를 노출하지 않는다", () => {
    for (const seconds of [0, 40, 59, 60, 90, 3120, 5048]) {
      expect(exitConfirmDescription(seconds)).not.toContain(":");
    }
  });
});

describe("자동 종료 안내 문구 — S3-8 (voice-tone.md §4)", () => {
  it("화면 꺼짐 트리거의 본문은 확정 문구다", () => {
    expect(autoEndBodyLinesFor("BACKGROUND")).toEqual([
      "화면이 꺼진 동안은 측정이 어려워서",
      "공부가 자동으로 종료됐어요",
    ]);
  });

  it("수동 일시정지 방치의 본문은 미정이라 비어 있다 — 화면 꺼짐 문구를 재사용하지 않는다", () => {
    // 화면을 끄지 않은 사용자에게 "화면이 꺼진 동안"이라고 안내하면 사실과 다르다.
    // voice-tone.md §4에 ⚠️ 미정으로 명시돼 있으므로 문구를 지어내지 않는다.
    expect(autoEndBodyLinesFor("MANUAL")).toBeNull();
  });

  it("타이틀·요약 라벨·CTA는 트리거와 무관하게 하나다", () => {
    expect(autoEndCopy().title).toBe("여기까지 기록을 저장했어요");
    expect(autoEndCopy().summaryLabels).toEqual({ focusSec: "순공시간", studySec: "총 공부" });
    expect(autoEndCopy().cta).toBe("결과 보기");
  });

  it("통계 라벨로서의 '화면 꺼짐'은 어디에도 없다 — 2026-07-26에 일시정지로 통합됐다", () => {
    // 단, S3-8 **본문**의 "화면이 꺼진 동안은…"은 종료 사유를 설명하는 확정 문장이라 남는다.
    // 라벨(요약 카드의 항목명)에 '화면 꺼짐'이 끼어드는 것만 막는다.
    expect(Object.values(autoEndCopy().summaryLabels).join(" ")).not.toContain("화면");
  });
});
