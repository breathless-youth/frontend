import { describe, expect, it } from "vitest";

import { appVersionLabel, cameraPermissionRowLabel, CONTACT_FORM_URL } from "../settingsInfo";

describe("appVersionLabel", () => {
  it("같은 주차의 Android는 한 표기로 합친다", () => {
    expect(appVersionLabel("26.37.2", "26.37.5", "android")).toBe("26.37.A2.5");
  });

  it("같은 주차의 iOS는 I를 쓴다", () => {
    expect(appVersionLabel("26.37.2", "26.37.5", "ios")).toBe("26.37.I2.5");
  });

  it("주차가 다르면 두 값을 나란히 적는다", () => {
    expect(appVersionLabel("26.36.3", "26.37.0", "android")).toBe("26.36.3 / 26.37.0");
  });

  it("앱 버전이 없으면 웹 버전만 보여준다 (브라우저 단독 접속)", () => {
    expect(appVersionLabel(null, "26.37.0", null)).toBe("26.37.0");
    expect(appVersionLabel("", "26.37.0", "android")).toBe("26.37.0");
  });

  it("플랫폼을 판별하지 못하면 합치지 않는다", () => {
    expect(appVersionLabel("26.37.2", "26.37.5", null)).toBe("26.37.2 / 26.37.5");
  });

  it("구형식 앱 버전도 나란히 적는다 (전환 전 바이너리)", () => {
    expect(appVersionLabel("1.0.2", "26.37.0", "ios")).toBe("1.0.2 / 26.37.0");
  });
});

describe("CONTACT_FORM_URL", () => {
  it("확정된 문의 폼 주소를 갖는다 (BY-257)", () => {
    expect(CONTACT_FORM_URL).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSfGeMYhOF8afmaPpPs-HnlC4IX8qAZxUWz47DvzdY27XzD5eA/viewform",
    );
  });

  it("WebView가 로드할 수 있는 https 주소다", () => {
    expect(CONTACT_FORM_URL.startsWith("https://")).toBe(true);
  });

  // forms.gle 단축 링크는 리다이렉트에 Cross-Origin-Resource-Policy: same-site를 실어
  // 보내 크로스사이트 iframe 임베드가 네트워크 레벨에서 차단된다(2026-08-06 Android 실기기
  // net::ERR_BLOCKED_BY_RESPONSE 확인) — 회귀 방지.
  it("forms.gle 단축 링크를 거치지 않는다 (CORP 차단 회귀 방지)", () => {
    expect(CONTACT_FORM_URL).not.toContain("forms.gle");
  });
});

describe("cameraPermissionRowLabel", () => {
  it("허용 여부를 색이 아니라 텍스트로 전달한다", () => {
    expect(cameraPermissionRowLabel(true)).toBe("카메라 권한, 허용됨, 시스템 설정 열기");
    expect(cameraPermissionRowLabel(false)).toBe("카메라 권한, 허용 안 됨, 시스템 설정 열기");
  });

  it("값을 바꾸는 스위치가 아니라 시스템 설정으로 나가는 버튼임을 알린다", () => {
    expect(cameraPermissionRowLabel(true)).toContain("시스템 설정 열기");
  });

  it("모르는 상태(null)는 허용 여부를 단정하지 않고 상태 부분을 뺀다 — 웹 설정 행의 기본 경로", () => {
    expect(cameraPermissionRowLabel(null)).toBe("카메라 권한, 시스템 설정 열기");
  });
});
