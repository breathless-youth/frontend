// 측정용 정적 서버. apps/web 빌드 산출물을 Vercel과 같은 캐시·격리 헤더로 서빙하고,
// 홈 통계와 솔로 세션 진입에 필요한 API만 흉내 낸다. 절차는 docs/runbooks/vision-prefetch-measurement.md.
//
//   node scripts/perf/serve.mjs <dist>          HTTP/1.1 평문. 에뮬레이터·시뮬레이터용(웹뷰는 자체 서명 인증서를 믿지 않는다)
//   HTTP2=1 node scripts/perf/serve.mjs <dist>  HTTP/2 + 자체 서명 TLS. 데스크톱 하네스용
//
// 환경변수
//   PORT       기본 4610
//   DELAY      요청마다 응답 전에 기다리는 ms(기본 0)
//   RATE_KBPS  모든 응답이 나눠 쓰는 대역폭 상한 kbps(기본 0 = 무제한). 9000이면 9 Mbps
import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createSecureServer } from "node:http2";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const CERT_DIR = fileURLToPath(new URL("../../.perf/certs/", import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".tflite": "application/octet-stream",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};

/** 압축해서 보내는 확장자. 운영에서 wasm이 약 3.4 MB로 전송된 것과 맞춘다. */
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".wasm", ".tflite"]);

const CHUNK_BYTES = 16 * 1024;

const STATS = {
  sessions: [],
  sessionCount: 1,
  totalStudySec: 7200,
  totalFocusSec: 5520,
  longestFocusSec: 3120,
  focusRate: 76.7,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};
const STREAK = { streak: 3, maxStreak: 9, studiedDatesInRange: [] };

/** 모든 응답이 나눠 쓰는 가상 회선이 비는 시각. RATE_KBPS를 걸었을 때만 쓴다. */
let linkFreeAt = 0;

export function ensureCert() {
  const keyPath = join(CERT_DIR, "key.pem");
  const certPath = join(CERT_DIR, "cert.pem");
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    mkdirSync(CERT_DIR, { recursive: true });
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "3650",
        "-subj",
        "/CN=127.0.0.1",
        "-keyout",
        keyPath,
        "-out",
        certPath,
      ],
      { stdio: "ignore" },
    );
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

/**
 * Chromium의 --ignore-certificate-errors-spki-list에 넘길 공개 키 해시.
 * 인증서 오류를 무시하는 모드(ignoreHTTPSErrors)는 응답을 HTTP 캐시에 남기지 않아 측정이 무의미해진다.
 * 이 목록에 든 키는 유효한 인증서로 취급돼 캐시가 정상 동작한다.
 */
export function certSpkiHash(cert) {
  const spki = new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spki).digest("base64");
}

/** 첫 요청이 압축 시간만큼 늦어지지 않도록 시작할 때 한 번에 압축해 둔다. */
function precompress(root) {
  const compressed = new Map();
  for (const relative of readdirSync(root, { recursive: true })) {
    const file = join(root, relative);
    if (COMPRESSIBLE.has(extname(file)) && statSync(file).isFile()) {
      compressed.set(file, gzipSync(readFileSync(file)));
    }
  }
  return compressed;
}

function sendJson(res, status, body) {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return 0;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
  return payload.length;
}

/** 홈 통계와 솔로 세션 진입에 필요한 응답만. 나머지 경로는 404다. */
function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/stats") return sendJson(res, 200, STATS);
  if (req.method === "GET" && pathname === "/api/stats/streak") return sendJson(res, 200, STREAK);
  if (req.method === "GET" && pathname === "/api/dday") return sendJson(res, 204);
  if (req.method === "PUT" && pathname === "/api/study-sessions/active") return sendJson(res, 204);
  // 진행중 세션 조회(GET /api/study-sessions/active)의 404는 "이어받을 세션 없음"이다.
  return sendJson(res, 404, { code: "NOT_FOUND", message: "perf mock" });
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * 본문을 보내고 연결이 닫힐 때까지 기다린다. 클라이언트가 도중에 끊으면 aborted가 참이고
 * bytes는 끊기기 전까지 응답에 넘긴 양이다. 끊긴 전송을 다 받은 것으로 읽지 않게 하려는 것이다.
 */
async function writeBody(res, body, bytesPerSec) {
  // DELAY 동안 이미 끊겼다면 close 이벤트는 지나갔다. HTTP/1.1은 res, HTTP/2는 res.stream에 흔적이 남는다.
  let closed = res.destroyed === true || res.stream?.destroyed === true;
  const whenClosed = closed
    ? Promise.resolve()
    : new Promise((done) => {
        res.once("close", () => {
          closed = true;
          done();
        });
      });
  let bytes = 0;
  if (bytesPerSec <= 0) {
    if (!closed) {
      res.end(body);
      bytes = body.length;
    }
  } else {
    for (let offset = 0; offset < body.length && !closed; offset += CHUNK_BYTES) {
      const chunk = body.subarray(offset, offset + CHUNK_BYTES);
      const now = Date.now();
      // 모든 응답이 회선 하나를 나눠 쓴다. 이 조각이 회선을 비우는 시각까지 기다렸다가 보낸다.
      linkFreeAt = Math.max(linkFreeAt, now) + (chunk.length / bytesPerSec) * 1000;
      await sleep(linkFreeAt - now);
      if (!closed) {
        res.write(chunk);
        bytes += chunk.length;
      }
    }
    if (!closed) {
      res.end();
    }
  }
  await whenClosed;
  // HTTP/2 호환 응답은 끊겨도 writableFinished가 참이라 스트림 종료 코드를 함께 본다(정상 종료는 0).
  const aborted = !res.writableFinished || (res.stream !== undefined && res.stream.rstCode !== 0);
  return { bytes, aborted };
}

async function handleStatic(req, res, root, compressed, bytesPerSec, pathname) {
  const requested = resolve(root, `.${pathname}`);
  if (requested !== root && !requested.startsWith(root + sep)) {
    res.writeHead(404);
    res.end();
    return { bytes: 0, aborted: false };
  }
  // SPA 폴백. Vercel rewrites와 같이 없는 경로는 index.html을 준다.
  const file =
    existsSync(requested) && statSync(requested).isFile() ? requested : join(root, "index.html");
  const stat = statSync(file);
  const headers = {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    // Vercel 기본값. 캐시는 하되 쓸 때마다 재검증한다(ETag가 같으면 304).
    "cache-control": "public, max-age=0, must-revalidate",
    etag: `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
    vary: "accept-encoding",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  };
  if (req.headers["if-none-match"] === headers.etag) {
    res.writeHead(304, headers);
    res.end();
    return { bytes: 0, aborted: false };
  }
  let body = readFileSync(file);
  const gzipped = compressed.get(file);
  if (gzipped !== undefined && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    body = gzipped;
    headers["content-encoding"] = "gzip";
  }
  headers["content-length"] = String(body.length);
  res.writeHead(200, headers);
  return writeBody(res, body, bytesPerSec);
}

export function startServer({ dist, port, http2 = false, delayMs = 0, rateKbps = 0, log = false }) {
  const root = resolve(dist);
  if (!existsSync(join(root, "index.html"))) {
    throw new Error(
      `빌드 산출물이 없습니다: ${root}\n` +
        "런북의 빌드 단계(perf:build:before·perf:build:after)를 먼저 실행하세요.",
    );
  }
  const compressed = precompress(root);
  const bytesPerSec = (rateKbps * 1000) / 8;

  const handler = (req, res) => {
    const startedAt = Date.now();
    setTimeout(async () => {
      let bytes = 0;
      let aborted = false;
      try {
        const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        if (pathname.startsWith("/api/")) {
          bytes = handleApi(req, res, pathname);
        } else {
          ({ bytes, aborted } = await handleStatic(
            req,
            res,
            root,
            compressed,
            bytesPerSec,
            pathname,
          ));
        }
      } catch (error) {
        console.error(error);
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      }
      if (log) {
        console.log(
          `${req.method} ${req.url} ${res.statusCode} ${aborted ? "ABORTED " : ""}${bytes}B ${Date.now() - startedAt}ms`,
        );
      }
    }, delayMs);
  };

  const server = http2
    ? createSecureServer({ ...ensureCert(), allowHTTP1: true }, handler)
    : createServer(handler);
  return new Promise((ready, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => ready(server));
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const dist = process.argv[2];
  if (dist === undefined) {
    console.error("사용법: node scripts/perf/serve.mjs <dist 경로>");
    process.exit(1);
  }
  const http2 = process.env.HTTP2 === "1";
  const port = Number(process.env.PORT ?? 4610);
  const delayMs = Number(process.env.DELAY ?? 0);
  const rateKbps = Number(process.env.RATE_KBPS ?? 0);
  await startServer({ dist, port, http2, delayMs, rateKbps, log: true });
  console.log(
    `${http2 ? "https" : "http"}://localhost:${port}  <-  ${resolve(dist)}  ` +
      `(HTTP/${http2 ? "2" : "1.1"}, DELAY=${delayMs}ms, RATE_KBPS=${rateKbps || "무제한"})`,
  );
}
