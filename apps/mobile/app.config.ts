import fs from "node:fs";
import path from "node:path";

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
  new URL(PROD_API_BASE_URL).hostname, // 현재 운영 도메인 — 상수와 이중 관리 방지
  new URL(PROD_WEB_BASE_URL).hostname,
];

function guardDevBaseUrl(name: string, value: string | undefined): string {
  const url = value ?? "";
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // 스킴을 빠뜨린 흔한 오타(api.focusmakers.app)로 가드가 우회되지 않게 검사용으로만
    // 재파싱한다. 그래도 파싱되지 않는 값은 가드 대상이 아니다
    // - 형식 검증까지 하면 기존에 동작하던 값을 깨뜨릴 수 있고, 가드의 일은 운영 차단 하나다.
    try {
      hostname = new URL(`https://${url}`).hostname;
    } catch {
      return url;
    }
  }
  if (PROD_HOSTS.includes(hostname)) {
    throw new Error(
      `${name}이 운영 주소(${hostname})를 가리킵니다 — 개발 빌드는 운영에 붙을 수 없습니다. ` +
        "apps/mobile/.env.local에 개발 서버 주소를 넣으세요 (.env.local.example 참고).",
    );
  }
  return url;
}

/**
 * Firebase 설정 파일 주입 (BY-585).
 *
 * `google-services.json`·`GoogleService-Info.plist`는 공개 저장소라 커밋하지 않는다. 경로를 env로
 * 받아 `googleServicesFile`에 넣고, EAS 빌드는 file 타입 환경변수로 같은 이름을 받는다. env가 없으면
 * 키를 넣지 않는다 — Metro만 띄우는 로컬 개발엔 파일이 필요 없고, prebuild가 필요한 명령에서는
 * `@react-native-firebase/app` plugin이 명확한 메시지로 실패한다.
 *
 * Firebase 프로젝트는 dev/prod 둘이다. 파일 안의 프로젝트 ID를 읽어 `APP_VARIANT`와 어긋나면
 * 여기서 끊는다 — 위 `guardDevBaseUrl`과 같은 원칙이다. dev 빌드가 운영 Remote Config·FCM에
 * 붙으면 최소 지원 버전 테스트가 실사용자를 막고, 테스트 푸시가 실사용자에게 간다.
 */
const PROD_FIREBASE_PROJECT_ID = "focusmakers-prod";

function readFirebaseProjectId(filePath: string): string | null {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (filePath.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text) as { project_info?: { project_id?: unknown } };
      const id = parsed.project_info?.project_id;
      return typeof id === "string" ? id : null;
    } catch {
      return null;
    }
  }
  // GoogleService-Info.plist — 키 하나만 필요해서 plist 파서 없이 정규식으로 읽는다.
  const match = /<key>PROJECT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(text);
  return match?.[1] ?? null;
}

function guardFirebaseFile(
  name: string,
  value: string | undefined,
  isProduction: boolean,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const projectId = readFirebaseProjectId(path.resolve(__dirname, value));
  const isProdFile = projectId === PROD_FIREBASE_PROJECT_ID;
  if (isProduction && !isProdFile) {
    throw new Error(
      `${name}이 운영 Firebase 프로젝트(${PROD_FIREBASE_PROJECT_ID}) 파일이 아닙니다` +
        `(읽힌 프로젝트: ${projectId ?? "없음"}). production 빌드에는 prod 파일을 주입하세요.`,
    );
  }
  if (!isProduction && isProdFile) {
    throw new Error(
      `${name}이 운영 Firebase 프로젝트(${PROD_FIREBASE_PROJECT_ID}) 파일을 가리킵니다 — ` +
        "개발 빌드는 dev 프로젝트 파일을 써야 합니다. apps/mobile/.env.local의 경로를 확인하세요.",
    );
  }
  return value;
}

export default function buildConfig({ config }: ConfigContext): ExpoConfig {
  const isProduction = process.env.APP_VARIANT === "production";
  const androidGoogleServicesFile = guardFirebaseFile(
    "GOOGLE_SERVICES_JSON",
    process.env.GOOGLE_SERVICES_JSON,
    isProduction,
  );
  const iosGoogleServicesFile = guardFirebaseFile(
    "GOOGLE_SERVICES_PLIST",
    process.env.GOOGLE_SERVICES_PLIST,
    isProduction,
  );

  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : null),
    },
    android: {
      ...config.android,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : null),
    },
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
