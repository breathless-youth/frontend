/**
 * 설정 화면이 표시하는 로컬 값과 문구 헬퍼
 *
 * 이 화면은 백엔드 API를 호출하지 않는다 — `packages/types`에 설정용 서버 계약을 만들지 않는다.
 * 여기 있는 값은 전부 기기 로컬 메타데이터이거나 화면이 여는 문서의 주소다.
 */

/**
 * 문의 폼(Google Forms) 주소
 *
 * - `forms.gle` 단축 링크가 아니라 `docs.google.com/forms/...` 전체 주소를 써야 한다.
 * `forms.gle`는 리다이렉트 응답에 `Cross-Origin-Resource-Policy: same-site`를 실어 보내는데,
 * 이 앱은 `google.com`과 same-site가 아니라서 크로스사이트 iframe으로
 * 이 리다이렉트를 태우면 브라우저가 그 응답 자체를 네트워크 레벨에서 차단한다.
 * 전체 주소는 이 헤더를 보내지 않아 정상적으로 임베드된다
 */
export const CONTACT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfGeMYhOF8afmaPpPs-HnlC4IX8qAZxUWz47DvzdY27XzD5eA/viewform";

const CALVER = /^(\d{2})\.([1-9]|[1-4]\d|5[0-3])\.(0|[1-9]\d*)$/;

export type StorePlatform = "android" | "ios";

/**
 * 화면에 표시할 버전
 *
 * RN 원본은 `expo-constants`에서 앱 버전을 직접 읽지만, 웹은 네이티브 셸이 없어 그 값을 얻지
 * 못한다. 대신 셸이 웹뷰 URL 쿼리 `appVersion`에 실어 보내는 값을 파라미터로 받아 순수 함수로
 * 유지한다. 웹 버전은 빌드 타임 상수라 항상 존재한다.
 *
 * 앱과 웹이 같은 주차면 `YY.WW.<A|I><앱 P>.<웹 P>` 한 표기로 합친다.
 * 주차가 다르거나 플랫폼을 판별할 수 없거나 앱이 구형식이면 두 값을 나란히 적는다.
 * 앱 버전이 없는 브라우저 단독 접속에서는 웹 버전만 보여준다.
 */
export function appVersionLabel(
  appVersion: string | null,
  webVersion: string,
  platform: StorePlatform | null,
): string {
  if (!appVersion) return webVersion;
  const app = CALVER.exec(appVersion);
  const web = CALVER.exec(webVersion);
  if (app && web && platform && app[1] === web[1] && app[2] === web[2]) {
    return `${app[1]}.${app[2]}.${platform === "android" ? "A" : "I"}${app[3]}.${web[3]}`;
  }
  return `${appVersion} / ${webVersion}`;
}

/**
 * 카메라 권한 행의 접근성 라벨
 *
 * 토글의 파란색만으로 허용 여부를 전달하지 않기 위해(`design.md` 색상 단독 전달 금지) 상태를 텍스트로 함께 읽어주고,
 * 이 행이 값을 바꾸는 스위치가 아니라 시스템 설정으로 나가는 버튼임을 라벨에서 분명히 한다.
 */
export function cameraPermissionRowLabel(granted: boolean | null): string {
  if (granted === null) {
    return "카메라 권한, 시스템 설정 열기";
  }
  return `카메라 권한, ${granted ? "허용됨" : "허용 안 됨"}, 시스템 설정 열기`;
}
