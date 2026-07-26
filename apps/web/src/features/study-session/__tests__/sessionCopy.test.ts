import { describe, expect, it } from "vitest";

import { PRIVACY_CAPTION, statusCopyFor } from "../sessionCopy";
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
      label: "기기를 움직인 것 같아요",
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
