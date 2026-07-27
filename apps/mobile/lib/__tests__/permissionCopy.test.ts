import appConfig from "../../app.json";

/**
 * S2-2는 만들 커스텀 UI가 없고 앱이 통제하는 것은 목적 문구뿐이다 — 그래서 이 문자열이
 * 사실상 S2-2 구현물 전체다. `.ai/product/voice-tone.md` §4 · `policies.md` §1 ·
 * Figma `52:155` 세 곳과 문자 단위로 일치해야 한다(의역·줄임·문장부호 변경 금지).
 */
const CONFIRMED_CAMERA_USAGE_COPY =
  "집중 측정에 사용해요. 영상은 기기 안에서만 처리되고 저장되지 않아요.";

describe("app.json 카메라 권한 문구 (S2-2)", () => {
  it("확정 카피와 문자 단위로 일치한다", () => {
    expect(appConfig.expo.ios.infoPlist.NSCameraUsageDescription).toBe(CONFIRMED_CAMERA_USAGE_COPY);
  });

  it("마이크 권한을 요청하지 않는다 (멀티룸 음성 송출 없음)", () => {
    expect(appConfig.expo.ios.infoPlist).not.toHaveProperty("NSMicrophoneUsageDescription");
    expect(appConfig.expo.android.permissions).toEqual(["CAMERA"]);
  });
});
