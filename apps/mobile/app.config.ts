import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * 앱 설정의 환경 분기
 * Expo는 app.json을 먼저 읽어 이 함수의 `config`로 넘긴다.
 */
const PROD_API_BASE_URL = "https://api.focusmakers.app";
const PROD_WEB_BASE_URL = "https://web.focusmakers.app";

// 개발 빌드가 운영으로 붙으면 개발 데이터가 운영 DB를 오염시킨다. RN의 fetch는 CORS를
// 적용하지 않아 서버가 막아줄 수 없으므로, 설정을 읽는 시점에 여기서 끊는다.
// sunqstudio는 iOS 레거시 빌드가 쓰는 옛 운영 도메인이라 목록에 함께 둔다.
const PROD_HOSTS = [
  "api.sunqstudio.kr", // iOS 레거시 빌드가 쓰는 옛 운영 도메인
  "web.sunqstudio.kr",
  "api.focusmakers.app", // 현재 운영 도메인
  "web.focusmakers.app",
];

function guardDevBaseUrl(name: string, value: string | undefined): string {
  const url = value ?? "";
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // 빈 값·URL이 아닌 값은 가드 대상이 아니다
    // - 형식 검증까지 하면 기존에 동작하던 값을 깨뜨릴 수 있고, 가드의 일은 운영 차단 하나다.
    return url;
  }
  if (PROD_HOSTS.includes(hostname)) {
    throw new Error(
      `${name}이 운영 주소(${hostname})를 가리킵니다 — 개발 빌드는 운영에 붙을 수 없습니다. ` +
        "apps/mobile/.env.local에 개발 서버 주소를 넣으세요 (.env.local.example 참고).",
    );
  }
  return url;
}

export default function buildConfig({ config }: ConfigContext): ExpoConfig {
  const isProduction = process.env.APP_VARIANT === "production";

  return {
    ...(config as ExpoConfig),
    extra: {
      ...config.extra,
      apiBaseUrl: isProduction
        ? PROD_API_BASE_URL
        : guardDevBaseUrl("API_BASE_URL", process.env.API_BASE_URL),
      webBaseUrl: isProduction
        ? PROD_WEB_BASE_URL
        : guardDevBaseUrl("WEB_BASE_URL", process.env.WEB_BASE_URL),
    },
  };
}
