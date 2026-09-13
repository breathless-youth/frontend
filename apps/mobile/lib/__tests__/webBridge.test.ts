import { injectMessageScript, parseToNativeMessage, serializeToWebMessage } from "../webBridge";

describe("parseToNativeMessage", () => {
  it.each([
    "session-ready",
    "home-ready",
    "analytics-ready",
    "start-session",
    "navigate-home",
    "open-settings",
  ] as const)("%s 메시지를 파싱한다", (type) => {
    expect(parseToNativeMessage(`{"type":"${type}","atMs":5}`)).toEqual({ type, atMs: 5 });
  });

  it("navigate-home 메시지를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"navigate-home","atMs":9}')).toEqual({
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

  it("atMs가 없으면 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"session-ready"}')).toBeNull();
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
    const script = injectMessageScript({ type: "app-state", state: "active", atMs: 1 });

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

describe("parseToNativeMessage — BY-436 생존 확인·화면 보고", () => {
  it("pong을 파싱한다", () => {
    expect(parseToNativeMessage(JSON.stringify({ type: "pong", id: 4, atMs: 1000 }))).toEqual({
      type: "pong",
      id: 4,
      atMs: 1000,
    });
  });

  it("pong의 id가 number가 아니면 버린다 — 짝을 못 맞추는 응답은 생존 증거가 못 된다", () => {
    expect(parseToNativeMessage(JSON.stringify({ type: "pong", id: "4", atMs: 1000 }))).toBeNull();
  });

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

describe("parseToNativeMessage — meta-app-event (BY-644)", () => {
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
