import Constants from "expo-constants";

import { resolveDevWebOrigin } from "../devWebOrigin";

jest.mock("expo-constants", () => ({ expoConfig: { extra: {} } }));

const mockConstants = Constants as unknown as { expoConfig: { extra: Record<string, unknown> } };

function setWebDevUrl(value: unknown) {
  mockConstants.expoConfig.extra = value === undefined ? {} : { webDevUrl: value };
}

describe("resolveDevWebOrigin", () => {
  afterEach(() => {
    setWebDevUrl(undefined);
    jest.restoreAllMocks();
  });

  it("값이 없으면 null — 동봉 자산 경로를 그대로 탄다", () => {
    setWebDevUrl(undefined);

    expect(resolveDevWebOrigin()).toBeNull();
  });

  /** 키를 지우지 않고 값만 비워서 끌 수 있어야 한다 — 커밋된 기본값이 빈 문자열이다. */
  it("빈 문자열은 꺼짐이다", () => {
    setWebDevUrl("");
    expect(resolveDevWebOrigin()).toBeNull();

    setWebDevUrl("   ");
    expect(resolveDevWebOrigin()).toBeNull();
  });

  it("Android용 localhost 주소를 그대로 돌려준다", () => {
    setWebDevUrl("http://localhost:5173");

    expect(resolveDevWebOrigin()).toBe("http://localhost:5173");
  });

  /** iOS 실기기는 secure context 때문에 HTTPS + LAN IP를 쓴다(`devWebOrigin.ts` 주석). */
  it("iOS용 HTTPS LAN 주소도 받는다", () => {
    setWebDevUrl("https://192.168.0.19:5173");

    expect(resolveDevWebOrigin()).toBe("https://192.168.0.19:5173");
  });

  /**
   * 끝 슬래시를 남기면 `buildSessionUrl`이 `//room/1`을 만든다. 그 URL은 서버에 따라
   * 404가 되거나 조용히 리다이렉트돼서, 증상만 보고는 원인을 짚기 어렵다.
   */
  it("끝 슬래시를 떼어 준다", () => {
    setWebDevUrl("http://localhost:5173/");

    expect(resolveDevWebOrigin()).toBe("http://localhost:5173");
  });

  /**
   * 스킴을 빠뜨리는 것은 흔한 오타인데, 그대로 넘기면 WebView가 상대 경로로 해석해
   * 원인과 증상이 전혀 안 맞는 실패가 된다. 무시하고 경고를 남긴다.
   */
  it("스킴이 없으면 무시하고 경고한다", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setWebDevUrl("192.168.0.19:5173");

    expect(resolveDevWebOrigin()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("문자열이 아니면 무시한다", () => {
    setWebDevUrl(5173);

    expect(resolveDevWebOrigin()).toBeNull();
  });
});
