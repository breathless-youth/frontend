import { injectMessageScript, parseToNativeMessage, serializeToWebMessage } from "../webBridge";

describe("parseToNativeMessage", () => {
  it.each(["session-ready", "start-session", "navigate-home", "open-settings"] as const)(
    "%s 메시지를 파싱한다",
    (type) => {
      expect(parseToNativeMessage(`{"type":"${type}","atMs":5}`)).toEqual({ type, atMs: 5 });
    },
  );

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

  it("submit-session을 파싱하고 request를 그대로 통과시킨다", () => {
    const raw = JSON.stringify({
      type: "submit-session",
      requestId: "submit-1",
      request: { userId: 7, studySec: 60, focusSec: 30, events: [] },
      atMs: 5,
    });

    expect(parseToNativeMessage(raw)).toEqual({
      type: "submit-session",
      requestId: "submit-1",
      request: { userId: 7, studySec: 60, focusSec: 30, events: [] },
      atMs: 5,
    });
  });

  it("requestId가 없으면 null이다 — 응답을 짝지을 수 없다", () => {
    expect(parseToNativeMessage('{"type":"submit-session","request":{},"atMs":5}')).toBeNull();
  });

  it("request가 객체가 아니면 null이다", () => {
    expect(
      parseToNativeMessage('{"type":"submit-session","requestId":"a","request":"x","atMs":5}'),
    ).toBeNull();
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
   * 서버 에러 문구에 따옴표·개행이 섞여 오면 스크립트가 깨진다. 한 번 더 `JSON.stringify`를
   * 거치므로 안전한 문자열 리터럴이 되어야 한다 — 실제로 평가해서 확인한다.
   */
  it("따옴표·개행이 섞인 문구도 스크립트를 깨뜨리지 않는다", () => {
    const message = {
      type: "submit-result" as const,
      requestId: "submit-1",
      ok: false as const,
      message: '그는 "실패"라고\n말했다',
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
