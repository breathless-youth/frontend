import appConfig from "../../app.json";
import enLocale from "../../locales/en.json";
import jaLocale from "../../locales/ja.json";
import koLocale from "../../locales/ko.json";
import zhHantLocale from "../../locales/zh-Hant.json";

/**
 * S2-2는 만들 커스텀 UI가 없고 앱이 통제하는 것은 목적 문구뿐이다 — 그래서 이 문자열이
 * 사실상 S2-2 구현물 전체다. `ai-wiki/product/voice-tone.md` §4 · `policies.md` §1 ·
 * Figma `52:155` 세 곳과 문자 단위로 일치해야 한다(의역·줄임·문장부호 변경 금지).
 */
const CONFIRMED_CAMERA_USAGE_COPY =
  "순공 시간 측정, 타임랩스 기록, 캠스터디 이용을 위해 카메라 접근이 필요해요. 공부 화면은 서버에 저장하지 않아요.";

/** 언어별 카메라 권한 문구. 캠스터디 영상은 다른 참여자에게 전달되므로 서버 저장만 부정하고 기기 밖 전송을 부정하지 않는다. */
const CAMERA_USAGE_COPY_BY_LOCALE = [
  ["ko", koLocale, CONFIRMED_CAMERA_USAGE_COPY],
  [
    "en",
    enLocale,
    "FocusMakers needs camera access to measure focus time, record time-lapses, and join cam study. Your study video isn't stored on our servers.",
  ],
  [
    "ja",
    jaLocale,
    "集中時間の測定、タイムラプスの記録、カムスタディの利用のためにカメラへのアクセスが必要です。学習中の映像はサーバーに保存しません。",
  ],
  [
    "zh-Hant",
    zhHantLocale,
    "需要存取相機，才能測量專注時間、記錄縮時攝影及使用視訊共讀。讀書畫面不會儲存在伺服器。",
  ],
] as const;

describe("app.json 카메라 권한 문구 (S2-2)", () => {
  it("확정 카피와 문자 단위로 일치한다", () => {
    expect(appConfig.expo.ios.infoPlist.NSCameraUsageDescription).toBe(CONFIRMED_CAMERA_USAGE_COPY);
  });

  it.each(CAMERA_USAGE_COPY_BY_LOCALE)(
    "%s 카메라 문구가 확정 번역과 일치한다",
    (_locale, locale, copy) => {
      expect(locale.NSCameraUsageDescription).toBe(copy);
    },
  );

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

  /**
   * ATT(앱 추적 투명성) 문구. `expo-tracking-transparency` plugin은 이 키가 없으면 **영어 기본 문구**를
   * 넣고, `react-native-fbsdk-next` plugin도 `iosUserTrackingPermission` 옵션으로 덮어쓸 수 있다 — 둘 다
   * `app.config.ts`가 옵션을 주지 않아 여기 값이 그대로 바이너리에 실린다(`metaSdkConfig.test.ts`).
   */
  it("추적 권한(ATT) 문구가 한국어 확정 카피다 (영어 기본값 주입 방지)", () => {
    expect(appConfig.expo.ios.infoPlist.NSUserTrackingUsageDescription).toBe(
      "설치 경로와 광고 효과를 확인하는 데 사용해요. 카메라 영상과 얼굴 데이터는 광고에 쓰이지 않아요.",
    );
  });

  /**
   * 그룹 공부방 마이크 권한 문구
   *
   * 웹뷰 안 getUserMedia도 앱의 네이티브 마이크 권한이 있어야 소리를 받는다.
   * 문구를 비워 두면 prebuild가 자동으로 적용하는 expo-camera 플러그인이 영어 기본 문구를 넣으므로 값을 고정한다.
   * 그 플러그인은 옵션이 없으면 이미 있는 값을 유지해서 여기 문구가 바이너리에 실린다.
   */
  it("마이크 권한을 공부방 문구로 요청한다", () => {
    expect(appConfig.expo.ios.infoPlist.NSMicrophoneUsageDescription).toBe(
      "공부방에서 그룹 멤버와 이야기할 때 사용해요. 목소리는 멤버만 들을 수 있고 녹음하거나 저장하지 않아요.",
    );
    expect(appConfig.expo.android.permissions).toContain("RECORD_AUDIO");
  });

  /**
   * 마이크 문구의 개인정보 표현
   *
   * 공부방 소리는 P2P로 멤버에게 바로 가므로 서버를 내세운 안내는 사실과 다르게 읽힌다.
   * 위 단언은 문구를 바꿀 때 함께 바뀌므로 이 규칙은 따로 남긴다.
   */
  it("마이크 문구는 영상이 서버로 가지 않는다고 말하지 않는다", () => {
    expect(appConfig.expo.ios.infoPlist.NSMicrophoneUsageDescription).not.toMatch(/서버/);
  });

  /**
   * 영어 마이크 문구의 개인정보 표현
   *
   * 영어 기기는 `locales/en.json`의 문구를 보므로 위 규칙을 영어판에도 건다.
   * 기기 밖으로 나가지 않는다는 말도 멤버에게 소리가 가는 공부방에는 맞지 않는다.
   */
  it("영어 마이크 문구도 서버나 기기 밖을 내세우지 않는다", () => {
    expect(enLocale.NSMicrophoneUsageDescription).not.toMatch(/server|leaves? your device/i);
  });

  /**
   * Face ID 권한 문구 제거
   *
   * 보안 저장소를 생체 인증 없이 쓰는데 플러그인은 옵션이 없으면 영어 Face ID 문구를 넣는다.
   * false를 주면 플러그인이 Info.plist에서 그 키를 지운다.
   */
  it("Face ID 권한 문구를 넣지 않는다", () => {
    expect(appConfig.expo.plugins).toContainEqual([
      "expo-secure-store",
      { faceIDPermission: false },
    ]);
    expect(appConfig.expo.ios.infoPlist).not.toHaveProperty("NSFaceIDUsageDescription");
  });

  /**
   * Android 권한 열거 고정
   *
   * 권한이 늘어날 때 이 배열을 고치면서 정말 필요한지 한 번 되묻게 하려는 것이다.
   */
  it("선언된 Android 권한은 카메라·센서·마이크·정확한 알람 권한뿐이다", () => {
    expect(appConfig.expo.android.permissions).toEqual([
      "CAMERA",
      // 가속도 20Hz 샘플링(설계 §5). Android 12+는 이게 없으면 센서 주기가 200ms로 묶여
      // 300ms 창에 표본이 2개만 들어가고 표준편차 판정이 성립하지 않는다.
      // normal 권한이라 런타임 다이얼로그는 뜨지 않는다.
      "HIGH_SAMPLING_RATE_SENSORS",
      // 런타임 요청은 웹이 처음 마이크를 켤 때 웹뷰가 한다.
      "RECORD_AUDIO",
      // 웹뷰 안 WebRTC가 오디오를 통화 모드로 바꿀 때 필요하다.
      // normal 권한이라 런타임 다이얼로그는 뜨지 않는다.
      "MODIFY_AUDIO_SETTINGS",
      // 휴식 끝 로컬 알림이 절전 중에도 고른 시각에 울리게 한다. 사용자가 끌 수 없는 권한이라 다이얼로그는 없다.
      "android.permission.USE_EXACT_ALARM",
    ]);
  });

  /**
   * 사진 앱 저장 권한 문구
   *
   * `expo-media-library` 플러그인은 옵션 값을 먼저, 없으면 `infoPlist` 값을, 둘 다 없을 때만 영어 기본 문구를 넣는다.
   * 두 곳을 같은 문구로 고정해 어느 쪽을 고치든 산출물이 바뀌지 않게 한다.
   * 읽기 문구는 우리가 읽기 권한을 요청하지 않아도 react-native-share가 사진 보관함 API를 참조해 필요하다.
   */
  const PHOTO_ADD_USAGE_COPY = "타임랩스 영상을 사진 앱에 저장하려면 사진 추가 권한이 필요해요";
  const PHOTO_READ_USAGE_COPY = "타임랩스 영상을 사진 앱에 저장할 때 사용해요";

  it("사진 추가·읽기 권한 문구가 한국어 확정 카피다 (영어 기본값 주입 방지)", () => {
    expect(appConfig.expo.ios.infoPlist.NSPhotoLibraryAddUsageDescription).toBe(
      PHOTO_ADD_USAGE_COPY,
    );
    expect(appConfig.expo.ios.infoPlist.NSPhotoLibraryUsageDescription).toBe(PHOTO_READ_USAGE_COPY);
  });

  it("expo-media-library 플러그인 옵션이 같은 문구를 쓰고 Android 사진·영상 읽기 권한을 넣지 않는다", () => {
    const entry = (appConfig.expo.plugins as unknown[]).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-media-library",
    ) as [string, Record<string, unknown>] | undefined;

    expect(entry?.[1]).toEqual({
      photosPermission: PHOTO_READ_USAGE_COPY,
      savePhotosPermission: PHOTO_ADD_USAGE_COPY,
      granularPermissions: [],
    });
  });

  /**
   * 플러그인이 넣는 읽기 권한 차단
   *
   * 저장에는 쓰기 권한만 필요하고 사진·영상을 읽는 기능은 없다.
   * 읽기 권한이 남으면 스토어 심사에서 사진 접근 사유를 따로 소명해야 한다.
   * 마이크 권한은 이 목록에 있으면 선언해도 빌드에서 빠지므로 넣지 않는다.
   */
  it("플러그인이 넣는 사진·영상 읽기 권한은 계속 막는다", () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual([
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
    ]);
  });
});
