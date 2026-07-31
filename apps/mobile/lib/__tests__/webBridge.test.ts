import { parseToNativeMessage, serializeToWebMessage } from "../webBridge";

describe("parseToNativeMessage", () => {
  it.each(["session-ready", "start-session", "exit-session", "open-settings"] as const)(
    "%s 메시지를 파싱한다",
    (type) => {
      expect(parseToNativeMessage(`{"type":"${type}","atMs":5}`)).toEqual({ type, atMs: 5 });
    },
  );

  it("알 수 없는 type은 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"future","atMs":5}')).toBeNull();
  });

  it("atMs가 없으면 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"session-ready"}')).toBeNull();
  });

  it("JSON이 아니면 null을 돌려준다", () => {
    expect(parseToNativeMessage("<html>")).toBeNull();
  });
});

describe("serializeToWebMessage", () => {
  it("device-handling을 JSON 문자열로 만든다", () => {
    expect(serializeToWebMessage({ type: "device-handling", active: true, atMs: 9 })).toBe(
      '{"type":"device-handling","active":true,"atMs":9}',
    );
  });
});
