import { injectMessageScript, parseToNativeMessage, serializeToWebMessage } from "../webBridge";

describe("parseToNativeMessage", () => {
  it.each([
    "home-ready",
    "analytics-ready",
    "start-session",
    "navigate-home",
    "open-settings",
    "auth-ready",
    "request-token-refresh",
  ] as const)("%s 메시지를 파싱한다", (type) => {
    expect(parseToNativeMessage(`{"type":"${type}","atMs":5}`)).toEqual({ type, atMs: 5 });
  });

  it("auth-ready에 atMs가 없으면 null이다 — 다른 메시지와 같은 규칙", () => {
    expect(parseToNativeMessage('{"type":"auth-ready"}')).toBeNull();
  });

  it("navigate-home 메시지를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"navigate-home","atMs":9}')).toEqual({
      type: "navigate-home",
      atMs: 9,
    });
  });

  it("navigate-home의 이어서 열 탭(tab)은 계약 값만 통과시킨다 — 모르는 값은 빼고 모달 닫기는 살린다", () => {
    expect(parseToNativeMessage('{"type":"navigate-home","tab":"records","atMs":9}')).toEqual({
      type: "navigate-home",
      tab: "records",
      atMs: 9,
    });
    expect(parseToNativeMessage('{"type":"navigate-home","tab":"profile","atMs":9}')).toEqual({
      type: "navigate-home",
      atMs: 9,
    });
  });

  it("navigate-home의 초대코드(inviteCode)는 4자리 숫자만 통과시키고, 아니면 그 필드만 빼고 모달 닫기는 살린다", () => {
    expect(parseToNativeMessage('{"type":"navigate-home","inviteCode":"4680","atMs":9}')).toEqual({
      type: "navigate-home",
      inviteCode: "4680",
      atMs: 9,
    });
    expect(parseToNativeMessage('{"type":"navigate-home","inviteCode":"46a0","atMs":9}')).toEqual({
      type: "navigate-home",
      atMs: 9,
    });
    expect(parseToNativeMessage('{"type":"navigate-home","inviteCode":4680,"atMs":9}')).toEqual({
      type: "navigate-home",
      atMs: 9,
    });
  });

  it("motion-sensor 메시지를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"motion-sensor","enabled":true,"atMs":7}')).toEqual({
      type: "motion-sensor",
      enabled: true,
      atMs: 7,
    });
  });

  it("haptic 메시지를 파싱하고 모르는 세기는 버린다", () => {
    expect(parseToNativeMessage('{"type":"haptic","style":"medium","atMs":3}')).toEqual({
      type: "haptic",
      style: "medium",
      atMs: 3,
    });
    expect(parseToNativeMessage('{"type":"haptic","style":"boom","atMs":3}')).toBeNull();
  });

  it("motion-sensor의 enabled가 boolean이 아니면 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"motion-sensor","enabled":"on","atMs":7}')).toBeNull();
  });

  it("request-camera-permission을 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"request-camera-permission","atMs":7}')).toEqual({
      type: "request-camera-permission",
      atMs: 7,
    });
  });

  it("share를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"share","text":"초대 텍스트","atMs":9}')).toEqual({
      type: "share",
      text: "초대 텍스트",
      atMs: 9,
    });
  });

  it("share의 선택 필드 url·title을 함께 파싱한다 — url은 레거시 웹 수신 호환용(BY-584)", () => {
    expect(
      parseToNativeMessage(
        '{"type":"share","text":"초대 텍스트","url":"https://example.com/social/join?code=0712","title":"포커스 메이커스 그룹 스터디","atMs":9}',
      ),
    ).toEqual({
      type: "share",
      text: "초대 텍스트",
      url: "https://example.com/social/join?code=0712",
      title: "포커스 메이커스 그룹 스터디",
      atMs: 9,
    });
  });

  it("share의 url·title이 문자열이 아니면 그 필드만 버린다 — text만으로도 시트는 열린다", () => {
    expect(parseToNativeMessage('{"type":"share","text":"초대 텍스트","url":1,"atMs":9}')).toEqual({
      type: "share",
      text: "초대 텍스트",
      atMs: 9,
    });
  });

  it("share의 text가 문자열이 아니면 null이다 — 빈 공유 시트를 열지 않는다", () => {
    expect(parseToNativeMessage('{"type":"share","text":1,"atMs":9}')).toBeNull();
  });

  it("navigate-tab을 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"navigate-tab","tab":"records","atMs":4}')).toEqual({
      type: "navigate-tab",
      tab: "records",
      atMs: 4,
    });
  });

  it("navigate-tab의 발신처(via)는 계약 값만 통과시킨다 — 모르는 값은 빼고 이동은 살린다", () => {
    expect(
      parseToNativeMessage('{"type":"navigate-tab","tab":"records","via":"study_result","atMs":4}'),
    ).toEqual({ type: "navigate-tab", tab: "records", via: "study_result", atMs: 4 });
    expect(
      parseToNativeMessage('{"type":"navigate-tab","tab":"records","via":"banner","atMs":4}'),
    ).toEqual({ type: "navigate-tab", tab: "records", atMs: 4 });
  });

  it("navigate-tab은 소셜 탭도 받는다 — 홈 친구 초대 카드의 via=invite_card", () => {
    expect(
      parseToNativeMessage('{"type":"navigate-tab","tab":"social","via":"invite_card","atMs":4}'),
    ).toEqual({ type: "navigate-tab", tab: "social", via: "invite_card", atMs: 4 });
  });

  it("navigate-tab의 목적지가 계약에 없으면 null이다 — 모르는 경로로 navigate하지 않는다", () => {
    expect(parseToNativeMessage('{"type":"navigate-tab","tab":"profile","atMs":4}')).toBeNull();
  });

  it("set-tab-bar를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"set-tab-bar","visible":false,"atMs":9}')).toEqual({
      type: "set-tab-bar",
      visible: false,
      atMs: 9,
    });
  });

  it("set-tab-bar의 visible이 boolean이 아니면 null이다 — 탭 바가 사라지면 이동 수단이 없어진다", () => {
    expect(parseToNativeMessage('{"type":"set-tab-bar","visible":"no","atMs":9}')).toBeNull();
  });

  it("blockedByModal을 파싱한다", () => {
    expect(
      parseToNativeMessage('{"type":"set-tab-bar","visible":false,"blockedByModal":true,"atMs":9}'),
    ).toEqual({
      type: "set-tab-bar",
      visible: false,
      blockedByModal: true,
      atMs: 9,
    });
  });

  it("blockedByModal이 boolean이 아니면 그 필드만 버린다 — 메시지를 통째로 버리면 탭 바 신호가 사라진다", () => {
    expect(
      parseToNativeMessage(
        '{"type":"set-tab-bar","visible":false,"blockedByModal":"yes","atMs":9}',
      ),
    ).toEqual({ type: "set-tab-bar", visible: false, atMs: 9 });
  });

  it("set-back-gesture를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"set-back-gesture","enabled":false,"atMs":9}')).toEqual({
      type: "set-back-gesture",
      enabled: false,
      atMs: 9,
    });
  });

  it("set-back-gesture의 enabled가 boolean이 아니면 null이다 — 문의하기 스와이프 복귀가 걸려 있다", () => {
    expect(parseToNativeMessage('{"type":"set-back-gesture","enabled":"off","atMs":9}')).toBeNull();
  });

  it("set-back-lock을 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"set-back-lock","locked":true,"atMs":9}')).toEqual({
      type: "set-back-lock",
      locked: true,
      atMs: 9,
    });
  });

  it("set-back-lock의 locked가 boolean이 아니면 null이다 — 뒤로가기가 영영 잠기면 안 된다", () => {
    expect(parseToNativeMessage('{"type":"set-back-lock","locked":"yes","atMs":9}')).toBeNull();
  });

  it("알 수 없는 type은 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"future","atMs":5}')).toBeNull();
  });

  it("지운 메시지(session-ready·pong)는 모르는 메시지로 버린다 — 구버전 웹이 보내도 죽지 않는다", () => {
    expect(parseToNativeMessage('{"type":"session-ready","atMs":5}')).toBeNull();
    expect(parseToNativeMessage('{"type":"pong","id":4,"atMs":5}')).toBeNull();
  });

  it("atMs가 없으면 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"home-ready"}')).toBeNull();
  });

  it("JSON이 아니면 null을 돌려준다", () => {
    expect(parseToNativeMessage("<html>")).toBeNull();
  });

  it("set-orientation을 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"set-orientation","unlocked":true,"atMs":1}')).toEqual({
      type: "set-orientation",
      unlocked: true,
      atMs: 1,
    });
  });

  it("set-orientation의 unlocked가 boolean이 아니면 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"set-orientation","unlocked":"yes","atMs":1}')).toBeNull();
  });

  it("request-camera-gate를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"request-camera-gate","atMs":1}')).toEqual({
      type: "request-camera-gate",
      atMs: 1,
    });
  });
});

describe("injectMessageScript", () => {
  it("웹이 설치한 전역을 호출한다 — 없으면 호출하지 않는다", () => {
    const script = injectMessageScript({ type: "camera-gate-result", granted: true, atMs: 1 });

    expect(script).toContain("if (window.__focusonNativeMessage)");
    expect(script).toContain("window.__focusonNativeMessage(");
    // iOS에서 마지막 표현식이 반환값이 되므로 객체를 남기지 않는다.
    expect(script.trimEnd().endsWith("true;")).toBe(true);
  });

  /**
   * 문자열 필드에 따옴표·개행이 섞여 오면 스크립트가 깨진다. 한 번 더 `JSON.stringify`를
   * 거치므로 안전한 문자열 리터럴이 되어야 한다 — 실제로 평가해서 확인한다.
   */
  it("따옴표·개행이 섞인 문구도 스크립트를 깨뜨리지 않는다", () => {
    const message = {
      type: "reset-route" as const,
      path: '/room/"1"\n?x=1',
      atMs: 1,
    };
    const script = injectMessageScript(message);

    const received: string[] = [];
    const window = { __focusonNativeMessage: (raw: string) => received.push(raw) };
    new Function("window", script)(window);

    expect(JSON.parse(received[0])).toEqual(message);
  });
});

describe("serializeToWebMessage", () => {
  it("device-handling을 JSON 문자열로 만든다", () => {
    expect(serializeToWebMessage({ type: "device-handling", active: true, atMs: 9 })).toBe(
      '{"type":"device-handling","active":true,"atMs":9}',
    );
  });
});

describe("parseToNativeMessage — 화면 보고", () => {
  it("report-screen을 파싱한다 — restoreQuery는 문자열 값만 남긴다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "report-screen",
          path: "/social/room/42",
          restoreQuery: { code: "0712", bad: 3 },
          dark: true,
          atMs: 1000,
        }),
      ),
    ).toEqual({
      type: "report-screen",
      path: "/social/room/42",
      restoreQuery: { code: "0712" },
      dark: true,
      atMs: 1000,
    });
  });

  it("report-screen의 path가 절대 경로가 아니면 버린다 — 임의 URL로 재마운트되면 안 된다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({ type: "report-screen", path: "https://evil.test", dark: false, atMs: 1 }),
      ),
    ).toBeNull();
  });

  it("report-screen의 dark가 boolean이 아니면 버린다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({ type: "report-screen", path: "/social", dark: "yes", atMs: 1 }),
      ),
    ).toBeNull();
  });
});

describe("parseToNativeMessage — meta-app-event", () => {
  it("이름·파라미터·valueToSum을 파싱한다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "meta-app-event",
          name: "study_session_ended",
          params: { room_type: "single", focus_sec: 600 },
          valueToSum: 600,
          atMs: 5,
        }),
      ),
    ).toEqual({
      type: "meta-app-event",
      name: "study_session_ended",
      params: { room_type: "single", focus_sec: 600 },
      valueToSum: 600,
      atMs: 5,
    });
  });

  it("파라미터·valueToSum 없이도 파싱한다 — 필드를 만들어 넣지 않는다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({ type: "meta-app-event", name: "social_room_entered", atMs: 5 }),
      ),
    ).toEqual({ type: "meta-app-event", name: "social_room_entered", atMs: 5 });
  });

  it.each(["1starts_with_digit", "한글이름", "a".repeat(41), "has.dot", ""])(
    "이름이 Meta 형식에 어긋나면(%s) 통째로 버린다 — SDK에 넘기면 네이티브 예외",
    (name) => {
      expect(
        parseToNativeMessage(JSON.stringify({ type: "meta-app-event", name, atMs: 5 })),
      ).toBeNull();
    },
  );

  it("이름이 문자열이 아니면 버린다", () => {
    expect(
      parseToNativeMessage(JSON.stringify({ type: "meta-app-event", name: 7, atMs: 5 })),
    ).toBeNull();
  });

  it("자유 문자열 값은 뺀다 — 닉네임·목표 문구가 실수로 실려도 Meta로 안 나간다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "meta-app-event",
          name: "study_session_started",
          params: {
            room_type: "single",
            nickname: "포메12345",
            goal: "오늘 3시간 공부하기",
            long_id: "x".repeat(33),
          },
          atMs: 5,
        }),
      ),
    ).toEqual({
      type: "meta-app-event",
      name: "study_session_started",
      params: { room_type: "single" },
      atMs: 5,
    });
  });

  it("형식 밖 파라미터 항목만 뺀다 — 객체·boolean·NaN 값, 형식 밖 키", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "meta-app-event",
          name: "study_session_started",
          params: {
            room_type: "single",
            nested: { a: 1 },
            flag: true,
            한글키: 1,
            list: [1],
            ok_number: 3,
          },
          atMs: 5,
        }),
      ),
    ).toEqual({
      type: "meta-app-event",
      name: "study_session_started",
      params: { room_type: "single", ok_number: 3 },
      atMs: 5,
    });
  });

  it("params가 객체가 아니면 통째로 버린다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({ type: "meta-app-event", name: "x", params: "room_type=single", atMs: 5 }),
      ),
    ).toBeNull();
  });

  it("파라미터는 25개까지만 남긴다 (Meta 규칙)", () => {
    const params = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p_${i}`, i]));
    const parsed = parseToNativeMessage(
      JSON.stringify({ type: "meta-app-event", name: "x", params, atMs: 5 }),
    );
    expect(parsed?.type).toBe("meta-app-event");
    expect(Object.keys((parsed as { params: Record<string, unknown> }).params)).toHaveLength(25);
  });

  it("valueToSum이 유한한 수가 아니면 그 필드만 뺀다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({ type: "meta-app-event", name: "x", valueToSum: "600", atMs: 5 }),
      ),
    ).toEqual({ type: "meta-app-event", name: "x", atMs: 5 });
  });
});

describe("parseToNativeMessage — analytics-event", () => {
  it("이름·파라미터를 파싱한다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "analytics-event",
          name: "study_session_ended",
          params: { room_type: "single", focus_sec: 600, will_submit: "true" },
          atMs: 5,
        }),
      ),
    ).toEqual({
      type: "analytics-event",
      name: "study_session_ended",
      params: { room_type: "single", focus_sec: 600, will_submit: "true" },
      atMs: 5,
    });
  });

  it("파라미터 없이도 파싱한다 — 필드를 만들어 넣지 않는다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({ type: "analytics-event", name: "social_room_entered", atMs: 5 }),
      ),
    ).toEqual({ type: "analytics-event", name: "social_room_entered", atMs: 5 });
  });

  it.each(["1starts_with_digit", "한글이름", "a".repeat(41), "has-dash", "has space", ""])(
    "이름이 Firebase 형식에 어긋나면(%s) 통째로 버린다 — SDK에 넘기면 예외",
    (name) => {
      expect(
        parseToNativeMessage(JSON.stringify({ type: "analytics-event", name, atMs: 5 })),
      ).toBeNull();
    },
  );

  it.each(["firebase_event", "google_event", "ga_event", "GA_Event"])(
    "예약 접두사 이름(%s)은 버린다",
    (name) => {
      expect(
        parseToNativeMessage(JSON.stringify({ type: "analytics-event", name, atMs: 5 })),
      ).toBeNull();
    },
  );

  it("형식 밖 파라미터 항목만 뺀다 — 자유 문자열·65자·빈 문자열, 객체·boolean·NaN 값, 형식 밖 키", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "analytics-event",
          name: "study_session_started",
          params: {
            room_type: "single",
            nickname: "포메12345",
            goal: "오늘 3시간 공부하기",
            sentence: "hello world",
            long_token: "x".repeat(65),
            empty: "",
            nested: { a: 1 },
            flag: true,
            한글키: 1,
            "has-dash": 1,
            ok_number: 3,
          },
          atMs: 5,
        }),
      ),
    ).toEqual({
      type: "analytics-event",
      name: "study_session_started",
      params: { room_type: "single", ok_number: 3 },
      atMs: 5,
    });
  });

  it("카탈로그의 토큰 값은 통과한다 — 에러 코드·정제된 경로·버전·'true'", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "analytics-event",
          name: "social_room_join_failed",
          params: {
            reason: "HTTP_404",
            path: "/room/:id",
            latest_version: "1.0.2",
            restored: "true",
          },
          atMs: 5,
        }),
      ),
    ).toEqual({
      type: "analytics-event",
      name: "social_room_join_failed",
      params: { reason: "HTTP_404", path: "/room/:id", latest_version: "1.0.2", restored: "true" },
      atMs: 5,
    });
  });

  it("파라미터는 25개까지만 남긴다", () => {
    const params = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i}`, i]));
    const parsed = parseToNativeMessage(
      JSON.stringify({ type: "analytics-event", name: "many_params", params, atMs: 5 }),
    );
    expect(Object.keys((parsed as { params: object }).params)).toHaveLength(25);
  });

  it("params가 객체가 아니면 통째로 버린다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({ type: "analytics-event", name: "x", params: "bad", atMs: 5 }),
      ),
    ).toBeNull();
  });
});

describe("parseToNativeMessage — analytics-user-properties", () => {
  it("토큰 문자열과 null(지움)만 남긴다 — 36자 초과·자유 문자열·boolean·형식 밖 키 제외", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "analytics-user-properties",
          properties: {
            has_dday: "false",
            dday_days_left: null,
            acquisition_channel: "preregister",
            is_webview: true,
            long: "x".repeat(37),
            nickname: "포메 12",
            한글: "값",
            a_very_long_property_name_over_24: "x",
          },
          atMs: 5,
        }),
      ),
    ).toEqual({
      type: "analytics-user-properties",
      properties: { has_dday: "false", dday_days_left: null, acquisition_channel: "preregister" },
      atMs: 5,
    });
  });

  it("남는 속성이 없으면 버린다 — 빈 갱신은 SDK 호출만 낭비한다", () => {
    expect(
      parseToNativeMessage(
        JSON.stringify({
          type: "analytics-user-properties",
          properties: { is_webview: true },
          atMs: 5,
        }),
      ),
    ).toBeNull();
    expect(
      parseToNativeMessage(JSON.stringify({ type: "analytics-user-properties", atMs: 5 })),
    ).toBeNull();
  });
});
