/**
 * 빌드 타임 API 주소 결정 — 사람이 입력한 주소를 신뢰하지 않고 빌드 컨텍스트가 정한다.
 *
 * 과거 Vercel 대시보드의 VITE_API_BASE_URL에 운영 주소가 잘못 들어가 개발 트래픽이
 * 운영 DB로 흘러간 사고가 있었다. 대시보드 값은 diff·리뷰·이력이 없어 코드로 막을
 * 수 없으므로, 여기서 환경과 주소를 대조해 어긋나면 빌드 자체를 실패시킨다 —
 * Vercel은 실패한 빌드를 승격하지 않아 실패 모드가 장애가 아니라 배포 거부다.
 */
export type DeployEnv = "production" | "preview" | "development";

const PROD_API_HOSTS = ["api.sunqstudio.kr", "api.focusmakers.app"];

const API_BY_ENV: Record<DeployEnv, string> = {
  production: "https://api.sunqstudio.kr",
  preview: "https://api-dev.focusmakers.app",
  development: "", // 로컬은 same-origin — vite.config.ts의 /api 프록시가 전달한다
};

/**
 * VITE_DEPLOY_ENV(명시)를 VERCEL_ENV보다 앞에 두는 이유: 운영 웹을 CloudFront로
 * 전환하면 빌드가 GitHub Actions로 넘어가 VERCEL_ENV가 없다. 그때 워크플로가
 * 명시 값을 주입하면 이 코드는 그대로 동작한다.
 */
export function resolveDeployEnv(env: NodeJS.ProcessEnv): DeployEnv {
  const raw = env.VITE_DEPLOY_ENV ?? env.VERCEL_ENV;
  return raw === "production" || raw === "preview" ? raw : "development";
}

/**
 * 검사용 호스트 추출. 스킴을 빠뜨린 흔한 오타(api.focusmakers.app)로 가드가 우회되지
 * 않게 파싱 실패 시 https://를 붙여 재시도한다. 그래도 안 되면 undefined.
 */
function hostnameOf(url: string): string | undefined {
  // 두 후보를 순서대로 시도하는 이유: 스킴 없는 값은 파싱이 던지거나(api.focusmakers.app),
  // 포트가 스킴으로 오해되어 hostname이 빈 문자열이 된다(api.focusmakers.app:443).
  // 둘 다 https://를 붙인 재파싱으로만 진짜 호스트가 나온다.
  for (const candidate of [url, `https://${url}`]) {
    try {
      const { hostname } = new URL(candidate);
      if (hostname !== "") {
        // trailing dot은 DNS상 같은 호스트다(api.focusmakers.app. ≡ api.focusmakers.app) —
        // 떼지 않으면 정확 일치 비교를 통과해 가드가 우회된다.
        return hostname.replace(/\.$/, "");
      }
    } catch {
      // 다음 후보로
    }
  }
  return undefined;
}

/**
 * 개발 환경의 값이 운영 API를 가리키면 던진다. 빈 값·호스트를 못 뽑는 값은 통과 —
 * 형식 검증은 가드의 일이 아니고, 그런 값은 어차피 운영에 붙지 못한다.
 */
export function assertNotProdApiHost(name: string, value: string | undefined): void {
  if (!value) {
    return;
  }
  const host = hostnameOf(value);
  if (host !== undefined && PROD_API_HOSTS.includes(host)) {
    throw new Error(
      `${name}: 운영 API(${host})를 가리키고 있습니다 — 개발 환경은 운영에 붙을 수 없습니다.`,
    );
  }
}

export function resolveApiBase(env: NodeJS.ProcessEnv): { deployEnv: DeployEnv; apiBase: string } {
  const deployEnv = resolveDeployEnv(env);
  // 대시보드 값이 매핑보다 우선한다 — 운영이 지금 이 값으로 돌고 있어서다.
  // 제거(매핑 단일 원천화)는 preview 실동작 검증 후의 별도 작업.
  const apiBase = env.VITE_API_BASE_URL || API_BY_ENV[deployEnv];

  if (deployEnv === "production") {
    // 운영은 fail-closed — 호스트를 못 뽑는 값도 운영 호스트가 아니므로 실패시킨다.
    // 신·구 어느 쪽이든 허용해 도메인 전환 날 대시보드 값만 바꾸면 되게 한다.
    const host = hostnameOf(apiBase);
    if (host === undefined || !PROD_API_HOSTS.includes(host)) {
      throw new Error(`운영 빌드의 API 주소가 운영 호스트가 아닙니다: ${apiBase || "(빈 값)"}`);
    }
  } else {
    assertNotProdApiHost("API 주소", apiBase);
  }
  return { deployEnv, apiBase };
}
