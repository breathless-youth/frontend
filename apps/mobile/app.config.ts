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
 * 받아 `googleServicesFile`에 넣고, EAS 빌드는 file 타입 환경변수로 같은 이름을 받는다. production이
 * 아닌 빌드는 env가 없으면 키를 넣지 않는다. Metro만 띄우는 로컬 개발엔 파일이 필요 없고,
 * prebuild가 필요한 명령에서는 `@react-native-firebase/app` plugin이 명확한 메시지로 실패한다.
 *
 * Firebase 프로젝트는 dev/prod 둘이다. 파일 안의 프로젝트 ID를 읽어 `APP_VARIANT`와 어긋나면
 * 여기서 끊는다 — 위 `guardDevBaseUrl`과 같은 원칙이다. dev 빌드가 운영 Remote Config·FCM에
 * 붙으면 최소 지원 버전 테스트가 실사용자를 막고, 테스트 푸시가 실사용자에게 간다.
 */
const APP_VARIANTS = ["production", "staging", "development"] as const;
type AppVariant = (typeof APP_VARIANTS)[number];

const PROD_FIREBASE_PROJECT_ID = "focusmakers-prod";
const DEV_FIREBASE_PROJECT_ID = "focusmakers-dev";

// 변형마다 파일을 받는 경로가 다르다. development만 `.env.local`이고 staging·production은 EAS
// environment의 file 변수다.
const FIREBASE_FILE_HINT: Record<AppVariant, string> = {
  production: "production 빌드에는 prod 파일을 주입하세요.",
  staging:
    "staging 빌드는 dev 프로젝트의 .staging 아이덴티티 파일을 써야 합니다. " +
    "EAS preview environment의 GOOGLE_SERVICES_JSON·GOOGLE_SERVICES_PLIST를 확인하세요.",
  development:
    "개발 빌드는 dev 프로젝트의 .dev 아이덴티티 파일을 써야 합니다. " +
    "apps/mobile/.env.local의 경로를 확인하세요.",
};

type FirebaseFileInfo = { projectId: string | null; appIds: string[] };

function readFirebaseFile(filePath: string): FirebaseFileInfo | null {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (filePath.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text) as {
        project_info?: { project_id?: unknown };
        client?: { client_info?: { android_client_info?: { package_name?: unknown } } }[];
      };
      const id = parsed.project_info?.project_id;
      // google-services.json 하나에 프로젝트의 Android 앱이 전부 들어온다. 그중 하나가 맞으면 된다.
      const appIds = (parsed.client ?? [])
        .map((c) => c.client_info?.android_client_info?.package_name)
        .filter((name): name is string => typeof name === "string");
      return { projectId: typeof id === "string" ? id : null, appIds };
    } catch {
      return null;
    }
  }
  // GoogleService-Info.plist는 키 두 개만 필요해서 plist 파서 없이 정규식으로 읽는다.
  const project = /<key>PROJECT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(text);
  const bundle = /<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(text);
  return { projectId: project?.[1] ?? null, appIds: bundle?.[1] ? [bundle[1]] : [] };
}

function guardFirebaseFile(
  name: string,
  value: string | undefined,
  variant: AppVariant,
  expectedAppId: string,
): string | undefined {
  const isProduction = variant === "production";
  if (!value) {
    // 운영 빌드는 파일 없이 나가면 안 된다. development·staging은 Metro만 띄우는 개발을 막지
    // 않으려고 키를 넣지 않고 넘어간다.
    if (isProduction) {
      throw new Error(
        `${name}이 비어 있습니다. ` +
          "production 빌드에는 EAS production environment의 file 변수로 prod Firebase 파일을 주입하세요.",
      );
    }
    return undefined;
  }
  const expectedProjectId = isProduction ? PROD_FIREBASE_PROJECT_ID : DEV_FIREBASE_PROJECT_ID;
  const info = readFirebaseFile(path.resolve(__dirname, value));
  if (info === null) {
    // `.env.local.example`이 경로를 기본값으로 채워 두는데 Metro만 띄우는 개발자에겐 파일이 없을 수
    // 있다. 개발 빌드는 그대로 통과시키고, prebuild가 필요한 명령에서는 RNFB plugin이 명확한
    // 메시지로 실패하게 둔다. 운영 빌드는 파일 없이 나가면 안 되므로 여기서 끊는다.
    if (!isProduction) {
      return value;
    }
    throw new Error(
      `${name}이 운영 Firebase 프로젝트(${PROD_FIREBASE_PROJECT_ID}) 파일이 아닙니다` +
        `(읽힌 프로젝트: 없음). ${FIREBASE_FILE_HINT[variant]}`,
    );
  }
  if (info.projectId !== expectedProjectId) {
    throw new Error(
      `${name}이 ${expectedProjectId} 프로젝트 파일이 아닙니다` +
        `(읽힌 프로젝트: ${info.projectId ?? "없음"}). ` +
        FIREBASE_FILE_HINT[variant],
    );
  }
  // 파일이 읽혔는데 이 빌드의 아이덴티티가 없으면 Android는 gradle에서 죽고 iOS는 경고만 남긴 채
  // 푸시가 오지 않는다. 둘 다 여기서 끊는다.
  if (!info.appIds.includes(expectedAppId)) {
    throw new Error(
      `${name}에 이 빌드의 아이덴티티(${expectedAppId})가 없습니다` +
        `(파일에 있는 아이덴티티: ${info.appIds.join(", ") || "없음"}). ` +
        `${FIREBASE_FILE_HINT[variant]} ` +
        "Firebase 콘솔에서 이 아이덴티티로 등록한 앱의 설정 파일을 쓰세요.",
    );
  }
  return value;
}

// 미설정만 development다. 오타가 development로 떨어지면 빈 주소 빌드가 아무 표시 없이
// 나가므로, 세 값 밖의 문자열은 여기서 끊는다.
function resolveAppVariant(raw: string | undefined): AppVariant {
  if (raw === undefined || raw === "") {
    return "development";
  }
  if ((APP_VARIANTS as readonly string[]).includes(raw)) {
    return raw as AppVariant;
  }
  throw new Error(
    `APP_VARIANT가 알 수 없는 값(${raw})입니다. production, staging, development 중 하나여야 합니다.`,
  );
}

// 접미사는 app.json의 base 값에 붙인다. 값을 여기 다시 적으면 app.json과 이중 관리가 된다.
const VARIANT_TABLE: Record<
  AppVariant,
  { idSuffix: string; nameSuffix: string; apiBaseUrl?: string; webBaseUrl?: string }
> = {
  production: {
    idSuffix: "",
    nameSuffix: "",
    apiBaseUrl: PROD_API_BASE_URL,
    webBaseUrl: PROD_WEB_BASE_URL,
  },
  staging: {
    idSuffix: ".staging",
    nameSuffix: " STG",
    apiBaseUrl: "https://api-dev.focusmakers.app",
    webBaseUrl: "https://web-dev.focusmakers.app",
  },
  development: { idSuffix: ".dev", nameSuffix: " DEV" },
};

export default function buildConfig({ config }: ConfigContext): ExpoConfig {
  const variant = resolveAppVariant(process.env.APP_VARIANT);
  const table = VARIANT_TABLE[variant];
  const bundleIdentifier = `${config.ios?.bundleIdentifier ?? ""}${table.idSuffix}`;
  const androidPackage = `${config.android?.package ?? ""}${table.idSuffix}`;

  const androidGoogleServicesFile = guardFirebaseFile(
    "GOOGLE_SERVICES_JSON",
    process.env.GOOGLE_SERVICES_JSON,
    variant,
    androidPackage,
  );
  const iosGoogleServicesFile = guardFirebaseFile(
    "GOOGLE_SERVICES_PLIST",
    process.env.GOOGLE_SERVICES_PLIST,
    variant,
    bundleIdentifier,
  );

  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      bundleIdentifier,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : null),
    },
    android: {
      ...config.android,
      package: androidPackage,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : null),
    },
    extra: {
      ...config.extra,
      appEnv: variant,
      appDisplayName: `${config.extra?.appDisplayName ?? ""}${table.nameSuffix}`,
      apiBaseUrl: table.apiBaseUrl ?? guardDevBaseUrl("API_BASE_URL", process.env.API_BASE_URL),
      webBaseUrl: table.webBaseUrl ?? guardDevBaseUrl("WEB_BASE_URL", process.env.WEB_BASE_URL),
    },
  };
}
