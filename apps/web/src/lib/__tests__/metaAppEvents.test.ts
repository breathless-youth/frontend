import { afterEach, describe, expect, it, vi } from "vitest";

import {
  META_TUTORIAL_COMPLETION_EVENT,
  trackMetaInviteShared,
  trackMetaSocialRoomEntered,
  trackMetaStudySessionEnded,
  trackMetaStudySessionStarted,
  trackMetaTutorialCompleted,
} from "@/lib/metaAppEvents";

/**
 * Meta 광고 전환 이벤트의 발신 계약 — 네이티브 `parseToNativeMessage`가 받는 모양
 * (`apps/mobile/lib/webBridge.ts`)과 대칭이다. 이벤트 목록은 이 파일의 발신자가 소유한다.
 */

/** Meta 앱 이벤트 이름·키 규칙 — 네이티브 `META_EVENT_NAME_PATTERN`과 같은 값. */
const META_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_\- ]{0,39}$/;

type Sent = { type: string; name: string; params?: Record<string, unknown>; atMs: number };

function stubBridge() {
  const postMessage = vi.fn();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
  return {
    sent: () => postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string) as Sent),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("metaAppEvents", () => {
  it("튜토리얼 완료는 Meta 표준 이벤트명과 fb_success=1로 나간다", () => {
    const bridge = stubBridge();

    trackMetaTutorialCompleted();

    expect(bridge.sent()).toEqual([
      expect.objectContaining({
        type: "meta-app-event",
        name: META_TUTORIAL_COMPLETION_EVENT,
        params: { fb_success: 1 },
      }),
    ]);
    expect(META_TUTORIAL_COMPLETION_EVENT).toBe("fb_mobile_tutorial_completion");
  });

  it("세션 시작은 룸 종류를 싣고, 복원 진입은 보내지 않는다 — 같은 세션의 두 번째 시작", () => {
    const bridge = stubBridge();

    trackMetaStudySessionStarted("social", false);
    trackMetaStudySessionStarted("single", true);

    expect(bridge.sent()).toEqual([
      expect.objectContaining({ name: "study_session_started", params: { room_type: "social" } }),
    ]);
  });

  it("세션 종료는 초 단위 정수 집계를 싣는다", () => {
    const bridge = stubBridge();

    trackMetaStudySessionEnded({ roomType: "single", studySec: 1800.4, focusSec: 1234.6 });

    expect(bridge.sent()).toEqual([
      expect.objectContaining({
        name: "study_session_ended",
        params: { room_type: "single", study_sec: 1800, focus_sec: 1235 },
      }),
    ]);
  });

  it("소셜룸 입장은 파라미터 없이 나간다 — 빈 객체를 만들어 넣지 않는다", () => {
    const bridge = stubBridge();

    trackMetaSocialRoomEntered();

    const [message] = bridge.sent();
    expect(message).toEqual({
      type: "meta-app-event",
      name: "social_room_entered",
      atMs: expect.any(Number),
    });
  });

  it("초대 공유는 방법을 싣고, 실패는 보내지 않는다 — 실패는 전환이 아니다", () => {
    const bridge = stubBridge();

    trackMetaInviteShared("shared");
    trackMetaInviteShared("copied");
    trackMetaInviteShared("failed");

    expect(bridge.sent().map((m) => m.params)).toEqual([
      { method: "shared" },
      { method: "copied" },
    ]);
  });

  it("모든 이벤트명·파라미터 키가 Meta 형식이다 — 네이티브가 형식 밖 이름은 통째로 버린다", () => {
    const bridge = stubBridge();

    trackMetaTutorialCompleted();
    trackMetaStudySessionStarted("single", false);
    trackMetaStudySessionEnded({ roomType: "single", studySec: 1, focusSec: 1 });
    trackMetaSocialRoomEntered();
    trackMetaInviteShared("shared");

    for (const message of bridge.sent()) {
      expect(message.name).toMatch(META_NAME_PATTERN);
      for (const [key, value] of Object.entries(message.params ?? {})) {
        expect(key).toMatch(META_NAME_PATTERN);
        expect(["string", "number"]).toContain(typeof value);
      }
    }
  });

  it("브라우저 단독 모드에서는 아무 일도 하지 않는다", () => {
    expect(() => {
      trackMetaTutorialCompleted();
      trackMetaStudySessionStarted("single", false);
      trackMetaStudySessionEnded({ roomType: "single", studySec: 1, focusSec: 1 });
      trackMetaSocialRoomEntered();
    }).not.toThrow();
  });
});
