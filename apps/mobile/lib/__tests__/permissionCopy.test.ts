import appConfig from "../../app.json";

/**
 * S2-2는 만들 커스텀 UI가 없고 앱이 통제하는 것은 목적 문구뿐이다 — 그래서 이 문자열이
 * 사실상 S2-2 구현물 전체다. `ai-wiki/product/voice-tone.md` §4 · `policies.md` §1 ·
 * Figma `52:155` 세 곳과 문자 단위로 일치해야 한다(의역·줄임·문장부호 변경 금지).
 */
const CONFIRMED_CAMERA_USAGE_COPY =
  "집중 측정에 사용해요. 영상은 기기 안에서만 처리되고 저장되지 않아요.";

describe("app.json 카메라 권한 문구 (S2-2)", () => {
  it("확정 카피와 문자 단위로 일치한다", () => {
    expect(appConfig.expo.ios.infoPlist.NSCameraUsageDescription).toBe(CONFIRMED_CAMERA_USAGE_COPY);
  });

  /**
   * `expo-sensors`는 prebuild에서 **영어 기본 문구**를 주입한다
   * (`"Allow $(PRODUCT_NAME) to access your device motion"`). `app.json`에 우리 문구를
   * 두면 그걸 덮어쓰므로, 이 단언이 그 오염을 잡는 자리다 — `expo-camera` plugin의
   * `NSMicrophoneUsageDescription` 주입과 같은 종류의 사고다(`apps/mobile/CLAUDE.md`).
   */
  it("모션 권한 문구가 한국어 확정 카피다 (영어 기본값 주입 방지)", () => {
    expect(appConfig.expo.ios.infoPlist.NSMotionUsageDescription).toBe(
      "기기를 만지는 순간을 감지해요. 센서 값은 기기 안에서만 쓰이고 저장되지 않아요.",
    );
  });

  it("마이크 권한을 요청하지 않는다 (멀티룸 음성 송출 없음)", () => {
    expect(appConfig.expo.ios.infoPlist).not.toHaveProperty("NSMicrophoneUsageDescription");
    expect(appConfig.expo.android.permissions).not.toContain("RECORD_AUDIO");
  });

  /**
   * 권한을 **열거로** 고정한다. `expo-camera` plugin을 `plugins`에 넣으면 `RECORD_AUDIO`가
   * 조용히 주입되는데(`apps/mobile/CLAUDE.md`), 위 부정 단언만으로는 그 외의 오염을 못 잡는다.
   * 권한이 늘어날 때 이 배열을 고치면서 "정말 필요한가"를 한 번 되묻게 하는 것이 목적이다.
   */
  it("선언된 Android 권한은 두 개뿐이다", () => {
    expect(appConfig.expo.android.permissions).toEqual([
      "CAMERA",
      // 가속도 20Hz 샘플링(설계 §5). Android 12+는 이게 없으면 센서 주기가 200ms로 묶여
      // 300ms 창에 표본이 2개만 들어가고 표준편차 판정이 성립하지 않는다.
      // normal 권한이라 런타임 다이얼로그는 뜨지 않는다.
      "HIGH_SAMPLING_RATE_SENSORS",
    ]);
  });
});
