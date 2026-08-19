import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * 앱 설정의 환경 분기(BY-402). app.json을 대체하는 것이 아니라 **받아서 덮어쓴다** —
 * Expo는 app.json을 먼저 읽어 이 함수의 `config`로 넘긴다.
 */
const PROD_API_BASE_URL = "https://api.sunqstudio.kr";
const PROD_WEB_BASE_URL = "https://web.sunqstudio.kr";

export default function buildConfig({ config }: Partial<ConfigContext>): ExpoConfig {
  const isProduction = process.env.APP_VARIANT === "production";

  return {
    ...(config as ExpoConfig),
    extra: {
      ...config?.extra,
      apiBaseUrl: isProduction ? PROD_API_BASE_URL : (process.env.API_BASE_URL ?? ""),
      webBaseUrl: isProduction ? PROD_WEB_BASE_URL : (process.env.WEB_BASE_URL ?? ""),
    },
  };
}
