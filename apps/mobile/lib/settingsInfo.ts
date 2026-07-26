import Constants from "expo-constants";
import { Linking } from "react-native";

/**
 * S6 설정 화면이 표시하는 로컬 값과 문구 헬퍼
 * (`frontend/docs/screens/SCR-S6-settings.md` Data Contract).
 *
 * **이 화면은 백엔드 API를 호출하지 않는다** — `packages/types`에 설정용 서버 계약을 만들지 않는다.
 * 여기 있는 값은 전부 기기 로컬 메타데이터이거나 아직 확정되지 않은 목적지 자리다.
 */

/**
 * 정적 진입점 4곳의 목적지. **전부 `null`이다 — 값을 지어내지 말 것.**
 *
 * ai-wiki 어디에도 실제 주소가 없고 `policies.md`는 개인정보처리방침을 "출시 전 별도 작성 필요"
 * TODO로 두고 있다. `null`인 행은 탭 핸들러 자체를 만들지 않아 버튼으로 노출되지 않는다.
 *
 * TODO(SCR-S6-settings.md Review Checklist): 4개 목적지 확정 필요 —
 *   문의 폼 주소, 그리고 이용약관·개인정보처리방침·오픈소스 라이선스가
 *   앱 내 WebView 화면인지 외부 링크인지(문서 자체도 아직 없음).
 */
export type SettingsLinks = {
  contactFormUrl: string | null;
  termsOfServiceUrl: string | null;
  privacyPolicyUrl: string | null;
  openSourceLicenseUrl: string | null;
};

export const SETTINGS_LINKS: SettingsLinks = {
  contactFormUrl: null,
  termsOfServiceUrl: null,
  privacyPolicyUrl: null,
  openSourceLicenseUrl: null,
};

/**
 * 앱 버전을 읽지 못했을 때만 보이는 대체 표기.
 * 버전 문자열 자체를 상수로 박으면 다음 릴리스에서 즉시 거짓말이 되므로 절대 넣지 않는다.
 */
export const UNKNOWN_APP_VERSION_LABEL = "알 수 없음";

/**
 * 화면에 표시할 앱 버전. `app.json`의 `expo.version`이 `expo-constants`를 통해 그대로 온다 —
 * 빌드 버전이 올라가면 화면도 자동으로 따라간다(Figma 예시 `1.0.0`을 하드코딩하지 않는다).
 */
export function appVersionLabel(): string {
  return Constants.expoConfig?.version ?? UNKNOWN_APP_VERSION_LABEL;
}

/**
 * 카메라 권한 행의 접근성 라벨.
 *
 * 토글의 파란색만으로 허용 여부를 전달하지 않기 위해(`design.md` 색상 단독 전달 금지) 상태를
 * 텍스트로 함께 읽어주고, 이 행이 값을 바꾸는 스위치가 아니라 **시스템 설정으로 나가는 버튼**임을
 * 라벨에서 분명히 한다.
 *
 * `granted`가 `null`이면(조회 전·조회 실패) 상태 부분을 아예 빼서 읽는다 — 모르는 값을
 * "허용 안 됨"으로 단정하면 화면의 토글보다 더 강하게 틀린 정보를 전달한다.
 */
export function cameraPermissionRowLabel(granted: boolean | null): string {
  if (granted === null) {
    return "카메라 권한, 시스템 설정 열기";
  }
  return `카메라 권한, ${granted ? "허용됨" : "허용 안 됨"}, 시스템 설정 열기`;
}

/**
 * 외부 브라우저로 연다(`문의하기` 행 — external-link 아이콘이 "앱 밖으로 나감"을 뜻한다).
 * 열지 못해도 설정 화면은 그대로 유지된다 — `openAppSettings()`와 같은 실패 처리다.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.warn("[settings] 외부 링크 열기 실패", error);
  }
}
