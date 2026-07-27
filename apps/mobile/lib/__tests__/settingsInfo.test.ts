import Constants from "expo-constants";

import appConfig from "../../app.json";
import {
  appVersionLabel,
  cameraPermissionRowLabel,
  CONTACT_FORM_URL,
  UNKNOWN_APP_VERSION_LABEL,
} from "../settingsInfo";

/**
 * `jest.mock` 팩토리는 호이스팅돼 모듈 최초 require 시점에 평가된다 — 바깥 변수를 참조하면
 * TDZ에 걸리므로, 팩토리 안에서 만든 객체를 import한 뒤 그 참조를 직접 수정한다.
 */
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.0.0" } },
}));

const mockedConstants = Constants as unknown as { expoConfig: { version?: string } | null };

beforeEach(() => {
  mockedConstants.expoConfig = { version: appConfig.expo.version };
});

describe("appVersionLabel", () => {
  it("app.json의 버전을 그대로 보여준다", () => {
    expect(appVersionLabel()).toBe("1.0.0");
  });

  it("버전이 올라가면 화면도 따라간다 (Figma 예시값 하드코딩 금지)", () => {
    mockedConstants.expoConfig = { version: "1.4.2" };

    expect(appVersionLabel()).toBe("1.4.2");
  });

  it("버전을 읽지 못해도 상수를 지어내지 않는다", () => {
    mockedConstants.expoConfig = null;

    expect(appVersionLabel()).toBe(UNKNOWN_APP_VERSION_LABEL);
  });
});

describe("CONTACT_FORM_URL", () => {
  it("확정된 문의 폼 주소를 갖는다 (BY-257)", () => {
    expect(CONTACT_FORM_URL).toBe("https://forms.gle/64ZZyLDE3A2F1oAB8");
  });

  it("WebView가 로드할 수 있는 https 주소다", () => {
    expect(CONTACT_FORM_URL.startsWith("https://")).toBe(true);
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
});
