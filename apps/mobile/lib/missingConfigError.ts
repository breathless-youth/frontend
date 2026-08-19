/**
 * 주소 설정이 비었을 때의 진단 에러
 */
export function missingConfigError(field: "apiBaseUrl" | "webBaseUrl"): Error {
  const envVar = field === "apiBaseUrl" ? "API_BASE_URL" : "WEB_BASE_URL";
  return new Error(
    `${field}이 비어 있습니다 — 개발은 apps/mobile/.env.local의 ${envVar}, 배포 빌드는 eas.json의 APP_VARIANT를 확인하세요`,
  );
}
