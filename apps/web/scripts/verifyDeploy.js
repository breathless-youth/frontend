/**
 * 배포 검증
 *
 * 배포가 끝난 주소에 직접 요청해 헤더, SPA 폴백, MIME을 확인한다.
 * 설정 파일을 읽는 테스트는 CDN이 실제로 무엇을 내보내는지 모른다.
 * 그래서 배포된 주소에 직접 묻는다.
 *
 * 사용: node scripts/verifyDeploy.js https://web-dev.focusmakers.app
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MEDIAPIPE_VERSION, WASM_SENTINEL_FILE } from "./copyMediapipeWasm.js";

const REDIRECTS = [301, 302, 307, 308];

/** 요청 하나의 제한 시간. 응답이 멈춘 호스트 때문에 워크플로 전체 제한 시간까지 붙잡히지 않게 한다. */
const REQUEST_TIMEOUT_MS = 15_000;

const header = (res, name) => res.headers.get(name) ?? "";
// MIME 유형은 대소문자를 구분하지 않고 `; charset=` 같은 매개변수가 붙는다.
const mediaType = (res) => header(res, "content-type").split(";")[0].trim().toLowerCase();
const directives = (value) => value.split(",").map((part) => part.trim());
const fail = (ok, message) => (ok ? [] : [message]);

/**
 * 응답 하나에 대한 판정 규칙
 *
 * 문제가 없으면 빈 배열을, 있으면 문제 문장 배열을 돌려준다.
 */
export const rules = {
  status: (code) => (res) => fail(res.status === code, `상태 ${code} 기대, 실제 ${res.status}`),
  statusAtLeast: (code) => (res) =>
    fail(res.status >= code, `상태 ${code} 이상 기대, 실제 ${res.status}`),
  contentType: (type) => (res) =>
    fail(
      mediaType(res) === type,
      `content-type ${type} 기대, 실제 "${header(res, "content-type")}"`,
    ),
  notContentType: (type) => (res) =>
    fail(mediaType(res) !== type, `content-type이 ${type}이면 안 된다`),
  header: (name, value) => (res) =>
    fail(header(res, name) === value, `${name}: ${value} 기대, 실제 "${header(res, name)}"`),
  noHeader: (name) => (res) =>
    fail(header(res, name) === "", `${name}가 없어야 한다, 실제 "${header(res, name)}"`),
  immutable: (res) =>
    fail(
      directives(header(res, "cache-control")).includes("immutable"),
      `cache-control에 immutable 기대, 실제 "${header(res, "cache-control")}"`,
    ),
  revalidate: (res) => {
    const list = directives(header(res, "cache-control"));
    return fail(
      list.includes("max-age=0") && !list.includes("immutable"),
      `cache-control max-age=0(immutable 없음) 기대, 실제 "${header(res, "cache-control")}"`,
    );
  },
  nonEmpty: (res) =>
    fail(
      Number(header(res, "content-length")) > 0,
      `content-length > 0 기대, 실제 "${header(res, "content-length")}"`,
    ),
  httpsRedirect: (res) =>
    fail(
      REDIRECTS.includes(res.status) && header(res, "location").startsWith("https://"),
      `https 리다이렉트 기대, 실제 ${res.status} → "${header(res, "location")}"`,
    ),
  noindex: (res) =>
    fail(
      directives(header(res, "x-robots-tag")).includes("noindex"),
      `X-Robots-Tag noindex 기대, 실제 "${header(res, "x-robots-tag")}"`,
    ),
};

/**
 * 배포된 index.html의 해시 자산 경로 찾기
 *
 * js 파일 하나만 찾는다.
 * 해시가 배포마다 바뀌어 경로를 고정할 수 없다.
 */
export function findAssetPath(html) {
  return /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? null;
}

const COOP = "cross-origin-opener-policy";
const COEP = "cross-origin-embedder-policy";

/** 교차 출처 격리. 없으면 Vision이 단일 스레드로 떨어진다. */
const isolated = [rules.header(COOP, "same-origin"), rules.header(COEP, "require-corp")];
/** 화면 응답 공통. 웹뷰 화면은 검색 결과에 잡히면 안 된다. */
const page = [rules.status(200), rules.contentType("text/html"), rules.noindex];

/**
 * 확인 목록
 *
 * 근거는 설계 문서의 확인 항목 표에 있다.
 * HTTP 리다이렉트와 없는 모델의 오류는 CDN이 직접 만드는 응답이라 noindex를 보지 않는다.
 *
 * @typedef {{ name: string, url: string, method: "GET" | "HEAD", rules: Array<(res: Response) => string[]> }} Check
 * @returns {Check[]}
 */
export function buildChecks(base, { models, assetPath }) {
  const url = (pathname) => new URL(pathname, base).href;
  const binary = [rules.status(200), rules.notContentType("text/html"), rules.nonEmpty];

  return [
    {
      name: "HTTP는 HTTPS로 리다이렉트",
      url: url("/").replace(/^https:/, "http:"),
      method: "GET",
      rules: [rules.httpsRedirect],
    },
    {
      name: "루트 화면",
      url: url("/"),
      method: "GET",
      rules: [...page, ...isolated, rules.revalidate],
    },
    {
      name: "라우트 새로고침 /room/1",
      url: url("/room/1"),
      method: "GET",
      rules: [...page, ...isolated],
    },
    {
      name: "/contact는 격리 헤더 없음",
      url: url("/contact"),
      method: "GET",
      rules: [...page, rules.noHeader(COOP), rules.noHeader(COEP)],
    },
    {
      name: "MediaPipe wasm",
      url: url(`/mediapipe/${MEDIAPIPE_VERSION}/wasm/${WASM_SENTINEL_FILE}`),
      method: "HEAD",
      rules: [rules.status(200), rules.contentType("application/wasm"), rules.noindex],
    },
    // 목록이 비면 모델 확인이 0개로 돌아 모델 자리에 HTML이 와도 통과하므로 실패로 남긴다.
    ...(models.length > 0
      ? models.map((file) => ({
          name: `모델 ${file}`,
          url: url(`/models/${file}`),
          method: "HEAD",
          rules: [...binary, rules.immutable, rules.noindex],
        }))
      : [
          {
            name: "모델",
            url: url("/models/"),
            method: "HEAD",
            rules: [() => ["public/models에서 모델 파일을 찾지 못했다"]],
          },
        ]),
    {
      name: "없는 모델은 오류",
      url: url("/models/__verify-missing__.tflite"),
      method: "HEAD",
      rules: [rules.statusAtLeast(400)],
    },
    assetPath
      ? {
          name: `해시 자산 ${assetPath}`,
          url: url(assetPath),
          method: "HEAD",
          rules: [rules.status(200), rules.immutable, rules.noindex],
        }
      : {
          name: "해시 자산",
          url: url("/"),
          method: "HEAD",
          rules: [() => ["index.html에서 /assets/…js를 찾지 못했다"]],
        },
    {
      name: "유니버설 링크 파일",
      url: url("/.well-known/apple-app-site-association"),
      method: "GET",
      rules: [rules.status(200), rules.contentType("application/json"), rules.noindex],
    },
  ];
}

/**
 * 확인 목록 실행
 *
 * 차례로 돌며 하나가 실패하거나 요청이 끊겨도 멈추지 않는다.
 * 압축 응답은 HEAD에서 content-length가 빠지므로(Vercel brotli) 압축 없이 요청한다.
 */
export async function runChecks(checks, fetchImpl = fetch) {
  const results = [];
  for (const check of checks) {
    let problems;
    try {
      const res = await fetchImpl(check.url, {
        method: check.method,
        redirect: "manual",
        headers: { "accept-encoding": "identity" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      problems = check.rules.flatMap((rule) => rule(res));
    } catch (error) {
      problems = [`요청 실패: ${error instanceof Error ? error.message : String(error)}`];
    }
    results.push({ name: check.name, url: check.url, problems });
  }
  return results;
}

/**
 * 검증 실행과 결과 출력
 *
 * 종료 코드를 돌려준다. 0은 전체 통과, 1은 실패 있음, 2는 잘못된 주소다.
 */
export async function main({ base, models, fetchImpl = fetch, log = console.log }) {
  if (URL.parse(base ?? "")?.protocol !== "https:") {
    log("사용: node scripts/verifyDeploy.js https://<호스트>");
    return 2;
  }

  let assetPath = null;
  try {
    const res = await fetchImpl(new URL("/", base).href, {
      redirect: "manual",
      headers: { "accept-encoding": "identity" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assetPath = findAssetPath(await res.text());
  } catch {
    // 루트 요청 실패는 아래 "루트 화면" 확인이 같은 원인으로 다시 보고한다.
  }

  const results = await runChecks(buildChecks(base, { models, assetPath }), fetchImpl);
  for (const { name, url, problems } of results) {
    log(`${problems.length > 0 ? "✗" : "✓"} ${name}`);
    for (const problem of problems) {
      log(`    ${problem} (${url})`);
    }
  }

  const failed = results.filter((result) => result.problems.length > 0).length;
  log(failed > 0 ? `\n${failed}/${results.length} 실패` : `\n${results.length}개 모두 통과`);
  return failed > 0 ? 1 : 0;
}

const MODELS_DIR = path.resolve(import.meta.dirname, "../public/models");

// 테스트가 이 모듈을 import하므로 직접 실행할 때만 요청을 보낸다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const models = fs
    .readdirSync(MODELS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  // exit() 대신 exitCode를 써서 파이프로 넘기는 출력이 잘리지 않게 한다.
  process.exitCode = await main({ base: process.argv[2], models });
}
