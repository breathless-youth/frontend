import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { buildGroupRoomFixtures } from "@/features/group-room/fixtures";
import { RoomHomeScreen } from "@/features/group-room/screens/RoomHomeScreen";
import { RoomMemberMenu } from "@/features/live-room/components/RoomMemberMenu";
import { RoomTile } from "@/features/live-room/components/RoomTile";
import { GROUP_ROOM_ANALYTICS_MASK } from "@/features/live-room/groupRoomAnalyticsMask";

/**
 * **실제 Amplitude SDK를 mock 없이 돌려 최종 전송 payload를 검사한다.**
 *
 * `amplitude.test.ts`는 SDK를 mock해서 "우리가 무엇을 호출했는가"만 본다. 그것만으로는
 * 2026-08-09에 실제로 있었던 누수를 못 잡는다 — `add()`를 `init()`보다 먼저 불러도 우리
 * enrichment 플러그인은 **가장 먼저** 실행되고, SDK 내부 플러그인(`pageUrlEnrichment`와
 * attribution의 `eventProperty` 모드)이 **그 뒤에** 원본 `location.href`·`document.referrer`를
 * 덧붙여서 정제를 통째로 우회했다. 호출 순서 검증은 전부 통과하는데 나가는 payload에는
 * `?userId=N`이 그대로 실려 있었다.
 *
 * 그래서 이 파일은 fetch를 가로채 **네트워크로 나가는 body**를 직접 본다. SDK 버전을 올리다
 * 플러그인 실행 순서나 autocapture 기본값이 바뀌면 여기서 깨진다.
 *
 * ⚠️ **테스트를 쪼개지 말 것.** `@amplitude/analytics-browser`는 모듈 수준 싱글턴이라
 * `vi.resetModules()`로도 클라이언트 인스턴스가 초기화되지 않는다. `initAmplitude()`를 두 번
 * 부르면 두 번째는 이미 등록된 플러그인·세션 상태를 물려받아 순서 의존적으로 깨진다.
 * 초기화는 파일당 한 번이고, 단언은 이 테스트 안에서 모두 한다.
 */

/**
 * Guides & Surveys SDK만 no-op으로 대체한다 — "실제 SDK" 원칙의 유일한 예외.
 *
 * npm 패키지가 로더라서다: `plugin().setup()`이 CDN 번들 로드를 기다리는 `boot`를 await하는데,
 * jsdom은 외부 `<script>`를 로드하지 않아 SDK 자체 타임아웃(10초)까지 초기화 체인 전체가
 * 멈춘다 — 이 테스트의 flush 시점에는 한 건도 전송되지 않아 첫 단언에서 깨진다. 설문 렌더러는
 * 통째로 원격 코드라, 이 테스트가 검증하는 전송 payload에 기여하는 로컬 코드도 없다.
 */
vi.mock("@amplitude/engagement-browser", () => ({
  plugin: () => ({
    name: "@amplitude/engagement-browser",
    type: "enrichment",
    execute: async (event: unknown) => event,
  }),
}));

const sent: { events: Record<string, unknown>[]; options?: { min_id_length?: number } }[] = [];

beforeEach(() => {
  sent.length = 0;
  // 네이티브 셸 계약: 모든 탭이 `?userId=N`으로 열린다. 전체 네비게이션이면 referrer에도 남는다.
  window.history.replaceState({}, "", "/room/42?userId=7&appVersion=1.0.0");
  Object.defineProperty(document, "referrer", {
    value: `${window.location.origin}/home?userId=7`,
    configurable: true,
  });
  vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
  // 리플레이 플러그인은 유휴 시간에 붙는다. 곧바로 실행해 init 뒤에 붙은 상태를 검사한다.
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { body?: string }) => {
      if (init?.body) sent.push(JSON.parse(init.body) as (typeof sent)[number]);
      const payload = {
        code: 200,
        events_ingested: 1,
        payload_size_bytes: 1,
        server_upload_time: 1,
      };
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(payload)),
        json: () => Promise.resolve(payload),
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** 이벤트 루프를 한 바퀴 돌려 SDK의 비동기 init·큐 처리를 진행시킨다. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Amplitude 전송 파이프라인 (실제 SDK)", () => {
  it("나가는 payload 어디에도 userId와 다른 사람의 닉네임·그룹 이름이 남지 않는다", async () => {
    const {
      initAmplitude,
      setGroupRoomCount,
      trackAmplitudePageView,
      trackGroupRoomApplicationAnswered,
      trackGroupRoomReported,
      trackSocialRoomEntered,
      trackSocialRoomExited,
      trackStudySessionStarted,
    } = await import("../amplitude");
    const amplitude = await import("@amplitude/analytics-browser");

    initAmplitude();
    // init은 비동기다 — 끝나기 전에 track하면 큐에만 쌓이고 아직 파이프라인을 안 탄다.
    await tick();
    await vi.dynamicImportSettled();

    trackAmplitudePageView("/room/42", "?userId=7&appVersion=1.0.0");
    trackStudySessionStarted("single");
    await amplitude.flush().promise;
    await tick();

    const events = sent.flatMap((batch) => batch.events);
    const body = JSON.stringify(sent);

    // 0건이면 아래 단언이 전부 공허하게 통과한다 — 먼저 실제 전송을 확인한다.
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["[Amplitude] Page Viewed", "study_session_started"]),
    );

    // 핵심 단언 — 어떤 이벤트에도 셸이 붙인 식별자가 실리지 않는다.
    expect(body).not.toContain("userId");

    // 숫자 경로가 남으면 같은 화면이 세션 수만큼 쪼개져 차트에서 묶이지 않는다.
    expect(body).toContain("/room/:id");
    expect(body).not.toContain("/room/42");

    // attribution의 userProperty 모드가 만드는 Identify 이벤트가 실제 누수 경로였다
    // (`$setOnce.initial_referrer` / `$set.referrer`에 `document.referrer` 원본이 담긴다).
    const identify = events.find((event) => event.event_type === "$identify");
    if (identify) {
      expect(JSON.stringify(identify)).not.toContain("userId");
    }

    // user_id는 URL이 아니라 제 자리(`user_id` 필드)로 나간다.
    expect(events.every((event) => event.user_id === "7")).toBe(true);

    // "7"은 1자다 — 요청에 `min_id_length`를 싣지 않으면 Amplitude 인제스트가 기본 최소
    // 길이(5자) 미달로 user_id를 제거해, 위 단언이 통과해도 콘솔에는 전원이 익명으로 남는다.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((batch) => batch.options?.min_id_length === 1)).toBe(true);

    // 그룹 홈의 제목, 책상, 순위에는 그룹 이름과 다른 멤버의 닉네임이 보인다.
    // 버튼 클릭은 가까운 제목의 글자를 Parent Label로 싣는다.
    // 버튼이 아닌 글자를 누른 뒤 화면이 바뀌면 그 글자를 Element Text로, 조상의 aria-label을 요소 계층으로 싣는다.
    // 화면에 단 가림 표시가 실제 SDK에서도 두 경로를 모두 가리는지 전송 payload로 본다.
    // jsdom에는 innerText가 없어 SDK가 글자를 빈 값으로 읽으므로 브라우저처럼 글자를 읽게 한다.
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get(this: HTMLElement) {
        return this.textContent;
      },
    });
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLElement.prototype, "innerText");
    });
    sent.length = 0;
    const now = new Date();
    const { roomHome } = buildGroupRoomFixtures(now);
    render(
      createElement(
        MemoryRouter,
        null,
        createElement(RoomHomeScreen, {
          room: roomHome,
          now,
          fetchedAtMs: now.getTime(),
          onBack: () => {},
          onToggleNotify: () => {},
          onMenuSelect: () => {},
          onOpenRequests: () => {},
          onEnterStudyRoom: () => {},
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "공부방 들어가기" }));
    fireEvent.click(within(screen.getByRole("list", { name: "멤버 책상" })).getByText("새벽러"));
    // 순공이 쌓이는 멤버가 있으면 그룹 홈은 1초마다 다시 그려서 누른 뒤 곧 화면이 바뀐다.
    document.body.append(document.createElement("div"));
    await tick();
    await amplitude.flush().promise;
    await tick();

    const groupClicks = sent
      .flatMap((batch) => batch.events)
      .filter((event) => event.event_type === "[Amplitude] Element Clicked")
      .map((event) => event.event_properties as Record<string, unknown>);
    // 두 클릭이 모두 나가야 아래의 가림 단언이 공허하지 않다.
    expect(groupClicks.map((properties) => properties["[Amplitude] Element Tag"])).toEqual([
      "button",
      "span",
    ]);
    for (const properties of groupClicks) {
      expect(properties["[Amplitude] Element Text"]).toBe("*****");
    }
    const groupNames = /수능 D-200 밤샘반|새벽러|합격까지|고구마맛탕|연필깎이|열공곰/;
    expect(JSON.stringify(sent)).not.toMatch(groupNames);

    // 그룹 공부방 타일에는 멤버 닉네임과 목표가, 멤버 메뉴 버튼의 aria-label에는 닉네임이 있다.
    // 타일을 누르면 조작 표시가 바뀌어 글자 클릭도 이벤트로 나가서 화면 루트의 가림 표시가 두 경로를 모두 가리는지 본다.
    sent.length = 0;
    render(
      createElement(
        "main",
        GROUP_ROOM_ANALYTICS_MASK,
        createElement(RoomTile, {
          member: {
            userId: 42,
            nickname: "책벌레곰",
            goal: "행정학 3회독",
            cameraOn: false,
            focusState: "FOCUS",
            focusSec: 600,
            micOn: true,
          },
          micOn: true,
          menuButton: createElement(RoomMemberMenu, {
            nickname: "책벌레곰",
            volume: 1,
            muted: false,
            canKick: false,
            placement: "below",
            open: false,
            container: null,
            onOpen: () => {},
            onClose: () => {},
            onVolumeChange: () => {},
            onToggleMute: () => {},
            onReport: () => {},
            onKick: () => {},
          }),
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "책벌레곰 메뉴" }));
    fireEvent.click(screen.getByText("책벌레곰"));
    document.body.append(document.createElement("div"));
    await tick();
    await amplitude.flush().promise;
    await tick();

    const roomClicks = sent
      .flatMap((batch) => batch.events)
      .filter((event) => event.event_type === "[Amplitude] Element Clicked");
    // 두 클릭이 모두 나가야 아래의 가림 단언이 공허하지 않다.
    expect(roomClicks).toHaveLength(2);
    expect(JSON.stringify(sent)).not.toMatch(/책벌레곰|행정학 3회독/);

    // 그룹 이벤트는 그룹 번호와 신청 번호가 든 화면에서 보내도 정한 속성만 나간다.
    // SDK가 화면 주소 같은 속성을 덧붙이면 그룹 번호가 함께 나가서 속성 전체를 그대로 비교한다.
    sent.length = 0;
    window.history.replaceState({}, "", "/social/groups/10/applications/41/report?userId=7");
    trackGroupRoomApplicationAnswered("reported");
    trackGroupRoomReported("application");
    setGroupRoomCount(2);
    window.history.replaceState({}, "", "/social/groups/10/room?userId=7");
    trackSocialRoomEntered(false, { visibility: "public" });
    trackSocialRoomExited({
      memberCount: 2,
      exitReason: "session_end",
      durationSec: 600,
      togetherSec: 420,
      visibility: "public",
    });
    await amplitude.flush().promise;
    await tick();

    const groupEvents = sent.flatMap((batch) => batch.events);
    expect(
      groupEvents
        .filter((event) => /^(group_room_|social_room_)/.test(String(event.event_type)))
        .map((event) => [event.event_type, event.event_properties]),
    ).toEqual([
      ["group_room_application_answered", { result: "reported" }],
      ["group_room_reported", { target: "application" }],
      ["social_room_entered", { grace_rejoin: false, visibility: "public" }],
      [
        "social_room_exited",
        {
          member_count: 2,
          exit_reason: "session_end",
          duration_sec: 600,
          together_sec: 420,
          visibility: "public",
        },
      ],
    ]);
    // 들어간 그룹 수는 이벤트가 아니라 사용자 속성으로 나간다.
    expect(groupEvents.find((event) => event.event_type === "$identify")?.user_properties).toEqual({
      $set: { group_room_count: 2 },
    });
  });
});
