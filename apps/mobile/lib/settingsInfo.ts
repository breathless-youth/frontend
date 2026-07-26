import Constants from "expo-constants";

/**
 * S6 설정 화면이 표시하는 로컬 값과 문구 헬퍼
 * (`frontend/docs/screens/SCR-S6-settings.md` Data Contract).
 *
 * **이 화면은 백엔드 API를 호출하지 않는다** — `packages/types`에 설정용 서버 계약을 만들지 않는다.
 * 여기 있는 값은 전부 기기 로컬 메타데이터이거나 화면이 여는 문서의 주소다.
 */

/**
 * 문의 폼(Google Forms) 주소. **앱을 벗어나지 않는다** — `/contact` 라우트의 WebView가 이 주소를
 * 띄운다(BY-257). 이용약관·개인정보처리방침도 같은 원칙이지만 그쪽은 정적 텍스트라 WebView 없이
 * `lib/legalDocuments.ts`의 본문을 직접 렌더한다. 문의는 응답을 제출해야 하는 인터랙티브 폼이라
 * 텍스트로 옮길 수 없어 WebView가 필요하다.
 */
export const CONTACT_FORM_URL = "https://forms.gle/64ZZyLDE3A2F1oAB8";

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
 */
export function cameraPermissionRowLabel(granted: boolean): string {
  return `카메라 권한, ${granted ? "허용됨" : "허용 안 됨"}, 시스템 설정 열기`;
}
