import { describe, expect, it } from "vitest";

import {
  appVersionLabel,
  cameraPermissionRowLabel,
  CONTACT_FORM_URL,
  UNKNOWN_APP_VERSION_LABEL,
} from "../settingsInfo";

describe("appVersionLabel", () => {
  it("URL 쿼리로 받은 버전을 그대로 보여준다", () => {
    expect(appVersionLabel("1.0.0")).toBe("1.0.0");
  });

  it("버전이 올라가면 화면도 따라간다 (Figma 예시값 하드코딩 금지)", () => {
    expect(appVersionLabel("1.4.2")).toBe("1.4.2");
  });

  it("버전을 읽지 못해도 상수를 지어내지 않는다 (null)", () => {
    expect(appVersionLabel(null)).toBe(UNKNOWN_APP_VERSION_LABEL);
  });

  it("빈 문자열도 알 수 없음으로 처리한다", () => {
    expect(appVersionLabel("")).toBe(UNKNOWN_APP_VERSION_LABEL);
  });
});

describe("CONTACT_FORM_URL", () => {
  it("확정된 문의 폼 주소를 갖는다 (BY-257)", () => {
    expect(CONTACT_FORM_URL).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSfje2_COocyehdAQSuoVAojQ-SVLXB6yCP4vMxjs3RYCC8C-w/viewform?usp=send_form",
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
