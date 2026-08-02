import { describe, expect, it } from "vitest";

import {
  AUTO_END_COPY,
  EXIT_CONFIRM_COPY,
  PAUSE_CAPTION,
  PRIVACY_CAPTION,
  SUB_MINUTE_EXIT_DESCRIPTION,
  autoEndBodyLinesFor,
  captionFor,
  exitConfirmDescription,
  statusCopyFor,
} from "../sessionCopy";
import { FOCUS_STATE, distractionState, pauseState, toEventStatus } from "../sessionState";

describe("statusCopyFor — voice-tone.md §3 상태 문구", () => {
  it("집중에는 서브 문구가 없다", () => {
    expect(statusCopyFor(FOCUS_STATE)).toEqual({ label: "집중 측정 중" });
  });

  it("비집중 3종 문구를 전부 갖는다 — Figma에 없는 2종도 구현한다", () => {
    expect(statusCopyFor(distractionState("AWAY"))).toEqual({
      label: "자리를 비운 것 같아요",
      subLabel: "돌아오면 자동으로 다시 측정돼요",
    });
    expect(statusCopyFor(distractionState("PHONE"))).toEqual({
      label: "휴대폰을 사용 중인 것 같아요",
      subLabel: "내려놓으면 자동으로 다시 측정돼요",
    });
    expect(statusCopyFor(distractionState("DEVICE"))).toEqual({
      label: "기기를 조작 중인 것 같아요",
      subLabel: "제자리에 두면 자동으로 다시 측정돼요",
    });
  });

  it("수동 일시정지와 화면 꺼짐은 같은 문구를 쓴다 — '화면 꺼짐'은 별도 유형이 아니다", () => {
    expect(statusCopyFor(pauseState("BACKGROUND"))).toEqual(statusCopyFor(pauseState("MANUAL")));
  });
});

describe("프라이버시 캡션", () => {
  it("싱글룸 문구만 쓴다 — 멀티룸 문구를 끌어오지 않는다", () => {
    expect(PRIVACY_CAPTION).toBe("영상은 기기 안에서만 처리돼요");
    expect(PRIVACY_CAPTION).not.toContain("서버");
  });
});

describe("captionFor — 하단 캡션은 한 줄만 (S3-3)", () => {
  it("일시정지에서는 프라이버시 캡션을 일시정지 캡션으로 교체한다", () => {
    expect(PAUSE_CAPTION).toBe("일시정지 중에는 시간이 흐르지 않아요");
    expect(captionFor(pauseState("MANUAL"))).toBe(PAUSE_CAPTION);
  });

  it("화면 꺼짐 트리거도 같은 캡션을 쓴다 — '화면 꺼짐' 라벨은 UI에 없다", () => {
    expect(captionFor(pauseState("BACKGROUND"))).toBe(PAUSE_CAPTION);
    expect(captionFor(pauseState("BACKGROUND"))).not.toContain("화면 꺼짐");
  });

  it("일시정지가 아니면 프라이버시 캡션이다", () => {
    expect(captionFor(FOCUS_STATE)).toBe(PRIVACY_CAPTION);
    expect(captionFor(distractionState("PHONE"))).toBe(PRIVACY_CAPTION);
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
});

describe("EXIT_CONFIRM_COPY — S3-7 종료 확인 (voice-tone.md §4)", () => {
  it("확정 문구를 그대로 쓴다", () => {
    expect(EXIT_CONFIRM_COPY).toEqual({
      title: "공부를 종료할까요?",
      cancel: "계속하기",
      confirm: "공부 종료",
    });
  });

  it("파괴적 액션 라벨을 '종료'로 축약하지 않는다 — 색만으로는 파괴성이 구분되지 않는다", () => {
    expect(EXIT_CONFIRM_COPY.confirm).toBe("공부 종료");
  });
});

describe("exitConfirmDescription — 한글 시간 길이 + 미달 분기", () => {
  it("1분 이상이면 저장을 약속한다", () => {
    expect(exitConfirmDescription(5048)).toBe("지금까지 집중한 1시간 24분은 저장돼요");
    expect(exitConfirmDescription(3120)).toBe("지금까지 집중한 52분은 저장돼요");
    expect(exitConfirmDescription(60)).toBe("지금까지 집중한 1분은 저장돼요");
  });

  /**
   * 순공 1분 미만 세션은 기록 목록·합산에서 제외된다(2026-07-27 확정). 기본 문구를 그대로
   * 쓰면 저장된다고 말하고는 기록 어디에도 안 남아 **화면이 거짓말을 한다.**
   */
  it("1분 미만이면 저장을 약속하지 않고 미달을 알린다", () => {
    expect(exitConfirmDescription(59)).toBe(SUB_MINUTE_EXIT_DESCRIPTION);
    expect(exitConfirmDescription(40)).toBe("1분 미만 공부는 기록에 표시되지 않아요");
    expect(exitConfirmDescription(0)).toBe(SUB_MINUTE_EXIT_DESCRIPTION);
  });

  it("미달 문구는 '저장'을 약속하지 않는다", () => {
    expect(exitConfirmDescription(40)).not.toContain("저장돼요");
  });

  it("어떤 값에도 초 숫자나 HH:MM:SS를 노출하지 않는다", () => {
    for (const seconds of [0, 40, 59, 60, 90, 3120, 5048]) {
      expect(exitConfirmDescription(seconds)).not.toContain(":");
    }
    // `1분 미만`의 '만'은 남지만 초 숫자는 어디에도 없다.
    expect(exitConfirmDescription(40)).not.toMatch(/\d+초/);
    expect(exitConfirmDescription(5048)).not.toMatch(/\d+초/);
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
    // voice-tone.md §4에 ⚠️ 미정으로 남아 있으므로 문구를 지어내지 않는다.
    expect(autoEndBodyLinesFor("MANUAL")).toBeNull();
  });

  it("타이틀·요약 라벨·CTA는 트리거와 무관하게 하나다", () => {
    expect(AUTO_END_COPY.title).toBe("여기까지 기록을 저장했어요");
    expect(AUTO_END_COPY.summaryLabels).toEqual({ focusSec: "순공시간", studySec: "총 공부" });
    expect(AUTO_END_COPY.cta).toBe("결과 보기");
  });

  it("통계 라벨로서의 '화면 꺼짐'은 어디에도 없다 — 2026-07-26에 일시정지로 통합됐다", () => {
    // 단, S3-8 **본문**의 "화면이 꺼진 동안은…"은 종료 사유를 설명하는 확정 문장이라 남는다.
    // 라벨(요약 카드의 항목명)에 '화면 꺼짐'이 끼어드는 것만 막는다.
    expect(Object.values(AUTO_END_COPY.summaryLabels).join(" ")).not.toContain("화면");
  });
});
