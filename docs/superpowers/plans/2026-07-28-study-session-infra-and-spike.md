# 공부 세션 인프라 + 스파이크 게이트 구현 계획 (BY-282 / 1단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/mobile`이 Dev Build에서 로컬 HTTP 서버로 `apps/web`의 세션 화면을 WebView에 띄우고, 그 안에서 실제 `getUserMedia` 카메라 프리뷰가 도는 상태까지 만든다.

**Architecture:** 설계 문서 [2026-07-27-study-session-vision-pipeline-design.md](../specs/2026-07-27-study-session-vision-pipeline-design.md) §1·§3의 서빙·카메라 부분만 구현한다. Vision 추론(§2·§4)과 가속도(§5), 지속성(§6·§7)은 후속 계획이다. 감지 신호는 이 계획이 끝난 뒤에도 여전히 mock(`createMockFocusDetector`)이며, 상태기계·타이머·화면은 **한 줄도 바뀌지 않는다** — 기존 `CameraAdapter`/`FocusDetector` 어댑터 뒤에만 실제 구현이 들어간다.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / expo-router 6 · Vite 7 + React 19 + Tailwind v4 · pnpm 워크스페이스 + Turborepo · jest-expo(모바일) · vitest + jsdom(웹)

## Global Constraints

- 패키지 매니저는 **pnpm 고정**. npm/yarn으로 바꾸지 않는다.
- TypeScript **strict**. `any` 대신 명시적 타입, 타입 전용 import는 `import type`.
- 각 패키지는 `lint`/`typecheck`/`test` 스크립트를 동일한 이름으로 노출한다.
- 커밋 메시지는 Conventional Commits. `commitlint.config.js`가 `@commitlint/config-conventional` 기본값만 강제하므로 **`feat`/`fix`/`docs`/`style`/`chore`/`refactor`/`test`/`build`만 안전**하다.
- PR 제목은 `[타입] BY-282 제목` 형식. CI `pr-title` job이 강제한다.
- **UI 컴포넌트가 카메라/서버 SDK를 직접 import하지 않는다** — 반드시 어댑터 인터페이스를 경유한다 (`frontend/CLAUDE.md` 아키텍처 경계).
- **카메라 원본 프레임·얼굴 이미지·좌표는 단말 내부에서만 처리한다.** 서버 전송·파일/캐시/DB 저장·로그 기록 금지.
- 세션 화면은 **항상 다크**다. `prefers-color-scheme: light`에서 밝아지면 안 된다.
- 사용자 노출 문구는 `ai-wiki/product/voice-tone.md`에서 **그대로** 가져온다. 새 문구를 지어내지 않는다.
- `apps/mobile`은 **경로 별칭이 없다** — 상대 경로로 import한다(`../../lib/foo`).
- `apps/web`은 `@/*` → `src/*` 별칭을 쓴다.
- **검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 않는다.** Task 5가 그 검증이며, 그 전까지 어떤 서버 라이브러리도 `package.json`에 들어가지 않는다.

---

### Task 1: web 빌드 산출물 동기화 스크립트와 CI 가드

`apps/web`을 고치고 asset 복사를 깜빡한 채 앱을 빌드하면 **에러 없이 옛 화면이 담긴 앱**이 나온다. 조용히 틀리는 종류라 자동 검사가 먼저 있어야 한다(설계 §1 빌드 파이프라인).

**Files:**

- Create: `apps/mobile/scripts/syncWebDist.js`
- Create: `apps/mobile/scripts/__tests__/syncWebDist.test.js`
- Modify: `apps/mobile/package.json` (scripts 3줄 추가)
- Modify: `turbo.json` (tasks에 `sync-web` 추가)
- Modify: `.github/workflows/ci.yml:67-68` 뒤에 검사 스텝 추가
- Modify: `apps/mobile/.gitignore` (`assets/web-dist/` 추가)

**Interfaces:**

- Consumes: 없음 (첫 태스크)
- Produces: `syncWebDist({ srcDir: string, destDir: string, mode: "copy" | "check" }): { ok: boolean; missing: string[]; stale: string[] }` — CommonJS `module.exports`. Task 9의 실기기 빌드가 이 스크립트를 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/mobile/scripts/__tests__/syncWebDist.test.js`:

```js
/** @jest-environment node */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { syncWebDist } = require("../syncWebDist");

describe("syncWebDist", () => {
  let srcDir;
  let destDir;

  beforeEach(() => {
    srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-src-"));
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-dest-"));
  });

  afterEach(() => {
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it("copy 모드는 중첩 디렉터리까지 그대로 복사한다", () => {
    fs.mkdirSync(path.join(srcDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(srcDir, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(srcDir, "assets", "app.js"), "console.log(1);");

    const result = syncWebDist({ srcDir, destDir, mode: "copy" });

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(destDir, "index.html"), "utf8")).toBe("<html></html>");
    expect(fs.readFileSync(path.join(destDir, "assets", "app.js"), "utf8")).toBe("console.log(1);");
  });

  it("copy 모드는 소스에서 사라진 옛 파일을 대상에서 지운다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "new");
    fs.writeFileSync(path.join(destDir, "old-chunk.js"), "stale");

    syncWebDist({ srcDir, destDir, mode: "copy" });

    expect(fs.existsSync(path.join(destDir, "old-chunk.js"))).toBe(false);
  });

  it("check 모드는 내용이 다르면 stale로 보고하고 파일을 고치지 않는다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "new");
    fs.writeFileSync(path.join(destDir, "index.html"), "old");

    const result = syncWebDist({ srcDir, destDir, mode: "check" });

    expect(result.ok).toBe(false);
    expect(result.stale).toEqual(["index.html"]);
    expect(fs.readFileSync(path.join(destDir, "index.html"), "utf8")).toBe("old");
  });

  it("check 모드는 대상에 없는 파일을 missing으로 보고한다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "new");

    const result = syncWebDist({ srcDir, destDir, mode: "check" });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["index.html"]);
  });

  it("소스와 대상이 같으면 check가 통과한다", () => {
    fs.writeFileSync(path.join(srcDir, "index.html"), "same");
    fs.writeFileSync(path.join(destDir, "index.html"), "same");

    expect(syncWebDist({ srcDir, destDir, mode: "check" })).toEqual({
      ok: true,
      missing: [],
      stale: [],
    });
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter mobile test -- syncWebDist`
Expected: FAIL — `Cannot find module '../syncWebDist'`

- [ ] **Step 3: 최소 구현을 쓴다**

`apps/mobile/scripts/syncWebDist.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

/**
 * apps/web 빌드 산출물을 apps/mobile 번들 asset으로 동기화한다.
 *
 * `copy`는 실제로 복사하고, `check`는 아무것도 고치지 않고 차이만 보고한다 —
 * CI가 "웹을 고치고 복사를 깜빡한 채 빌드된 앱"을 잡는 가드로 쓴다. 그 실패는
 * 에러 없이 옛 화면이 담긴 앱을 만들기 때문에 자동 검사가 필요하다
 * (설계 문서 §1 빌드 파이프라인).
 */
function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    })
    .sort();
}

function syncWebDist({ srcDir, destDir, mode }) {
  const srcFiles = listFiles(srcDir);
  const missing = [];
  const stale = [];

  for (const rel of srcFiles) {
    const from = path.join(srcDir, rel);
    const to = path.join(destDir, rel);

    if (mode === "check") {
      if (!fs.existsSync(to)) {
        missing.push(rel);
      } else if (!fs.readFileSync(from).equals(fs.readFileSync(to))) {
        stale.push(rel);
      }
      continue;
    }

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  if (mode === "copy") {
    // 소스에서 사라진 옛 청크가 남으면 앱 번들이 계속 불어난다.
    const keep = new Set(srcFiles);
    for (const rel of listFiles(destDir)) {
      if (!keep.has(rel)) {
        fs.rmSync(path.join(destDir, rel));
      }
    }
  }

  return { ok: missing.length === 0 && stale.length === 0, missing, stale };
}

module.exports = { syncWebDist };

if (require.main === module) {
  const mode = process.argv.includes("--check") ? "check" : "copy";
  const srcDir = path.resolve(__dirname, "../../web/dist");
  const destDir = path.resolve(__dirname, "../assets/web-dist");

  if (!fs.existsSync(srcDir)) {
    console.error(
      `apps/web 빌드 산출물이 없습니다: ${srcDir}\n먼저 'pnpm --filter web build'를 실행하세요.`,
    );
    process.exit(1);
  }

  const result = syncWebDist({ srcDir, destDir, mode });
  if (!result.ok) {
    console.error("assets/web-dist가 apps/web 빌드와 다릅니다.");
    for (const rel of result.missing) console.error(`  누락: ${rel}`);
    for (const rel of result.stale) console.error(`  낡음: ${rel}`);
    console.error("'pnpm --filter mobile sync-web'을 실행한 뒤 다시 커밋하세요.");
    process.exit(1);
  }
  console.log(mode === "check" ? "web-dist 동기화 상태 정상" : `web-dist 동기화 완료 → ${destDir}`);
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter mobile test -- syncWebDist`
Expected: PASS (5 tests)

- [ ] **Step 5: package.json에 스크립트를 추가한다**

`apps/mobile/package.json`의 `scripts`에 두 줄 추가:

```json
    "sync-web": "node scripts/syncWebDist.js",
    "sync-web:check": "node scripts/syncWebDist.js --check",
```

- [ ] **Step 6: turbo.json에 태스크를 추가한다**

`turbo.json`의 `tasks` 객체에 추가 (`test` 항목 뒤):

```json
    "sync-web": {
      "dependsOn": ["web#build"],
      "cache": false
    }
```

- [ ] **Step 7: 빌드 산출물을 git에서 제외한다**

`apps/mobile/.gitignore` 끝에 추가:

```gitignore

# apps/web 빌드 산출물의 복사본 — 빌드 시 scripts/syncWebDist.js가 채운다.
# 커밋하면 웹 빌드가 두 곳에서 갈리므로 추적하지 않는다.
assets/web-dist/
```

- [ ] **Step 8: CI에 동기화 검사를 추가한다**

`.github/workflows/ci.yml`의 `Build web` 스텝(67-68행) 바로 뒤에 삽입:

```yaml
# apps/web을 고치고 assets/web-dist 복사를 빠뜨리면 옛 화면이 담긴 앱이
# 에러 없이 빌드된다 — 조용히 틀리므로 CI가 잡는다.
- name: Check web-dist sync
  run: pnpm --filter mobile sync-web && pnpm --filter mobile sync-web:check
```

- [ ] **Step 9: 전체 검사를 돌린다**

Run: `pnpm --filter mobile test && pnpm --filter mobile lint && pnpm --filter mobile typecheck`
Expected: 전부 PASS

- [ ] **Step 10: 커밋**

```bash
git add apps/mobile/scripts apps/mobile/package.json apps/mobile/.gitignore turbo.json .github/workflows/ci.yml
git commit -m "build: apps/web 빌드 산출물을 모바일 asset으로 동기화하는 스크립트 추가 (BY-282)"
```

---

### Task 2: expo-dev-client 도입과 EAS 프로젝트 초기화

로컬 HTTP 서버는 네이티브 모듈이라 Expo Go에서 돌지 않는다. Dev Build 체계를 먼저 세운다(설계 §1 "비용 — Expo Go 이탈"). **이 태스크에는 새 단위 테스트가 없다** — 검증은 기존 가드 테스트가 계속 통과하는지와 Dev Build가 실제로 서는지다.

**Files:**

- Modify: `apps/mobile/package.json` (dependencies에 `expo-dev-client`)
- Modify: `apps/mobile/app.json` (`extra.eas.projectId` — `eas init`이 자동 삽입)
- Modify: `apps/mobile/CLAUDE.md` ("Expo Go와 호환되지 않는 네이티브 모듈이 없다" 서술 갱신)

**Interfaces:**

- Consumes: 없음
- Produces: 실기기에 설치된 Dev Build. Task 5·9의 실기기 검증이 이것 위에서 돈다.

- [ ] **Step 1: 변경 전 가드 테스트가 통과하는지 확인한다**

Run: `pnpm --filter mobile test -- permissionCopy`
Expected: PASS — 이 테스트가 `NSCameraUsageDescription` 문구를 문자 단위로, `android.permissions`를 `["CAMERA"]` 정확 일치로 잠그고 있다(ADR 0004). 아래 변경이 `app.json`을 오염시키면 여기서 잡힌다.

- [ ] **Step 2: expo-dev-client를 설치한다**

```bash
pnpm --filter mobile exec expo install expo-dev-client
```

`expo install`을 쓰는 이유는 Expo SDK 54에 맞는 버전을 자동으로 고르기 때문이다. `pnpm add`로 최신을 받으면 SDK와 어긋난다.

- [ ] **Step 3: 가드 테스트를 다시 돌려 app.json이 오염되지 않았는지 확인한다**

Run: `pnpm --filter mobile test -- permissionCopy`
Expected: PASS — `expo-dev-client`는 권한을 추가하지 않으므로 그대로 통과해야 한다. 실패하면 config plugin이 권한을 주입한 것이므로 `app.json`의 `plugins`에서 제거한다.

- [ ] **Step 4: EAS 프로젝트를 발급한다**

```bash
pnpm --filter mobile exec eas init
```

`app.json`에 `extra.eas.projectId`가 추가된다. `eas.json`은 이미 `development`(`developmentClient: true`)·`preview`·`production` 프로파일을 갖고 있으므로 **수정하지 않는다.**

- [ ] **Step 5: 가드 테스트를 한 번 더 돌린다**

Run: `pnpm --filter mobile test -- permissionCopy`
Expected: PASS — `extra` 아래 추가는 `infoPlist`·`permissions`를 건드리지 않는다.

- [ ] **Step 6: iOS Dev Build를 만들고 실기기에 설치한다**

```bash
pnpm --filter mobile exec eas build --profile development --platform ios
```

빌드가 끝나면 EAS가 주는 QR/링크로 실기기에 설치한다. Apple Developer 계정이 필요하다(확보 완료).

- [ ] **Step 7: Dev Build에서 앱이 뜨는지 확인한다**

```bash
pnpm --filter mobile start
```

Dev Build 앱을 열어 개발 서버에 연결하고 **홈(S1)·기록(S5)·설정(S6)·온보딩 가이드(G1~G5)가 Expo Go에서와 동일하게 뜨는지** 눈으로 확인한다. 여기서 깨지면 이후 태스크의 실기기 검증이 전부 오염되므로 반드시 통과시키고 넘어간다.

- [ ] **Step 8: CLAUDE.md의 낡은 서술을 고친다**

`apps/mobile/CLAUDE.md`의 "WebView 스터디룸 (재구축 예정)" 절에서 아래 문장을 찾아 교체한다.

교체 전:

```markdown
- 지금 `apps/mobile`에는 Expo Go와 호환되지 않는 네이티브 모듈이 없으므로 `expo-dev-client`/`eas.json`을 쓸 필요가 없다(재설치 시점은 아래 참고). `expo-camera`도 Expo Go에 기본 포함이라 이 전제를 깨지 않는다.
```

교체 후:

```markdown
- **2026-07-28부터 Dev Build로 개발한다.** 로컬 HTTP 서버(설계 문서 §1)가 Expo Go에 없는 네이티브 모듈이라 `expo-dev-client` + EAS Build가 필요해졌다. `react-native-webview`·`expo-sensors`·`expo-file-system`은 Expo Go에도 있지만, 서버 하나 때문에 Expo Go 경로 자체가 닫힌다. 평소 개발은 그대로 `pnpm --filter mobile start`이며, **재빌드는 네이티브 의존성이 바뀔 때만** 필요하다.
```

- [ ] **Step 9: 전체 검사를 돌린다**

Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm --filter mobile test`
Expected: 전부 PASS

- [ ] **Step 10: 커밋**

```bash
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/CLAUDE.md pnpm-lock.yaml
git commit -m "build: expo-dev-client 도입과 EAS 프로젝트 초기화 (BY-282)"
```

---

### Task 3: 로컬 서버 어댑터 인터페이스와 세션 URL 조립

서버 라이브러리는 Task 5 스파이크에서 정한다. 그전까지 화면·훅이 기댈 **인터페이스와 fake**를 먼저 만든다 — 기존 `cameraAdapter.ts`·`focusDetector.ts`가 쓰는 것과 같은 패턴이다.

**Files:**

- Create: `apps/mobile/lib/webAssetServer.ts`
- Create: `apps/mobile/lib/__tests__/webAssetServer.test.ts`

**Interfaces:**

- Consumes: 없음
- Produces:
  - `interface WebAssetServer { start(): Promise<string>; stop(): Promise<void>; readonly origin: string | null }`
  - `createFakeWebAssetServer(options?: FakeWebAssetServerOptions): FakeWebAssetServer` — `FakeWebAssetServer extends WebAssetServer { readonly startCount: number }`
  - `buildSessionUrl(origin: string, params: { roomId: string; userId: number | null }): string`
  - Task 4의 WebView 라우트와 Task 5의 실제 구현이 이 셋을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/mobile/lib/__tests__/webAssetServer.test.ts`:

```ts
import { buildSessionUrl, createFakeWebAssetServer } from "../webAssetServer";

describe("buildSessionUrl", () => {
  it("userId가 있으면 쿼리로 붙인다", () => {
    expect(buildSessionUrl("http://localhost:8081", { roomId: "1", userId: 7 })).toBe(
      "http://localhost:8081/room/1?userId=7",
    );
  });

  it("userId가 없으면 쿼리를 붙이지 않는다 — apps/web이 unsaved 경로로 처리한다", () => {
    expect(buildSessionUrl("http://localhost:8081", { roomId: "1", userId: null })).toBe(
      "http://localhost:8081/room/1",
    );
  });

  it("오리진 끝의 슬래시를 중복시키지 않는다", () => {
    expect(buildSessionUrl("http://localhost:8081/", { roomId: "1", userId: null })).toBe(
      "http://localhost:8081/room/1",
    );
  });
});

describe("createFakeWebAssetServer", () => {
  it("start 전에는 origin이 null이다", () => {
    expect(createFakeWebAssetServer().origin).toBeNull();
  });

  it("start가 오리진을 돌려주고 origin에 반영한다", async () => {
    const server = createFakeWebAssetServer({ origin: "http://localhost:9999" });

    await expect(server.start()).resolves.toBe("http://localhost:9999");
    expect(server.origin).toBe("http://localhost:9999");
  });

  it("이미 떠 있으면 다시 띄우지 않고 같은 오리진을 준다", async () => {
    const server = createFakeWebAssetServer();

    const first = await server.start();
    const second = await server.start();

    expect(second).toBe(first);
    expect(server.startCount).toBe(1);
  });

  it("stop 후에는 origin이 null로 돌아가고 다시 start할 수 있다", async () => {
    const server = createFakeWebAssetServer();

    await server.start();
    await server.stop();
    expect(server.origin).toBeNull();

    await server.start();
    expect(server.startCount).toBe(2);
  });

  it("failToStart면 start가 거부되고 origin이 null로 남는다", async () => {
    const server = createFakeWebAssetServer({ failToStart: true });

    await expect(server.start()).rejects.toThrow("web asset server failed to start");
    expect(server.origin).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter mobile test -- webAssetServer`
Expected: FAIL — `Cannot find module '../webAssetServer'`

- [ ] **Step 3: 최소 구현을 쓴다**

`apps/mobile/lib/webAssetServer.ts`:

```ts
/**
 * 번들에 동봉된 `apps/web` 빌드 산출물을 `http://localhost:{port}`로 서빙하는 어댑터.
 *
 * `file://`이 아니라 localhost로 여는 이유는 설계 문서 §1에 있다 — `file://`은
 * `getUserMedia` 승인이 기기별로 갈리고, COOP/COEP 헤더를 붙일 수 없어 멀티스레드
 * wasm 경로가 막히며, `react-router`의 history 라우팅을 받아줄 주체가 없다.
 *
 * **실제 구현은 아직 없다.** 서버 라이브러리는 실기기 스파이크(S1)에서 정한다 —
 * `frontend/CLAUDE.md`의 "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것"에
 * 따라, 그전까지 라우트·테스트는 아래 fake로만 동작한다.
 */
export interface WebAssetServer {
  /** 서버를 띄우고 오리진을 돌려준다. 이미 떠 있으면 같은 값을 그대로 준다. */
  start(): Promise<string>;
  stop(): Promise<void>;
  /** 살아 있으면 오리진, 아니면 `null`. */
  readonly origin: string | null;
}

export interface FakeWebAssetServerOptions {
  /** 테스트가 기대할 오리진. 포트는 실제로는 동적 할당된다(설계 §1). */
  readonly origin?: string;
  /** 기동 실패(포트 충돌 등)를 재현한다. */
  readonly failToStart?: boolean;
}

export interface FakeWebAssetServer extends WebAssetServer {
  /** 실제로 기동한 횟수 — 중복 기동을 막았는지 검증하는 데 쓴다. */
  readonly startCount: number;
}

export function createFakeWebAssetServer(
  options: FakeWebAssetServerOptions = {},
): FakeWebAssetServer {
  const origin = options.origin ?? "http://localhost:8081";
  let current: string | null = null;
  let startCount = 0;

  return {
    get origin() {
      return current;
    },
    get startCount() {
      return startCount;
    },
    async start() {
      if (current !== null) {
        return current;
      }
      if (options.failToStart === true) {
        throw new Error("web asset server failed to start");
      }
      startCount += 1;
      current = origin;
      return current;
    },
    async stop() {
      current = null;
    },
  };
}

/**
 * 서버 오리진 + 세션 파라미터 → WebView가 열 URL.
 *
 * 경로 `/room/:id?userId=N`은 `apps/web`의 기존 라우트 계약이다(`App.tsx`).
 * `userId`가 없으면 쿼리를 아예 붙이지 않는다 — `apps/web`이 그 부재를 `unsaved`
 * 경로로 처리하므로 `userId=null` 같은 문자열을 보내면 파싱이 어긋난다.
 */
export function buildSessionUrl(
  origin: string,
  params: { roomId: string; userId: number | null },
): string {
  const base = `${origin.replace(/\/$/, "")}/room/${params.roomId}`;
  return params.userId === null ? base : `${base}?userId=${params.userId}`;
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter mobile test -- webAssetServer`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/lib/webAssetServer.ts apps/mobile/lib/__tests__/webAssetServer.test.ts
git commit -m "feat(mobile): 로컬 웹 자산 서버 어댑터 인터페이스와 세션 URL 조립 추가 (BY-282)"
```

---

### Task 4: WebView 세션 라우트와 집중 시작 배선

`app/room/[id].tsx`를 되살리고, 홈(S1)과 온보딩 가이드(G5)의 `startSession` no-op을 실제 이동으로 바꾼다. 서버는 Task 3의 fake를 주입해 테스트한다.

**Files:**

- Create: `apps/mobile/app/room/[id].tsx`
- Create: `apps/mobile/__tests__/session-room.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx:32-36` (주석 자리에 `Stack.Screen` 등록)
- Modify: `apps/mobile/app/(tabs)/index.tsx:26-29` (`startSession` 본문)
- Modify: `apps/mobile/app/onboarding-guide.tsx:45-49` (`startSession` 본문)
- Modify: `apps/mobile/package.json` (`react-native-webview`)

**Interfaces:**

- Consumes: `WebAssetServer` · `createFakeWebAssetServer` · `buildSessionUrl` (Task 3)
- Produces:
  - `SessionRoomScreen` 기본 export — expo-router가 `/room/:id`로 등록
  - `setWebAssetServer(server: WebAssetServer): void` — 테스트 주입점. `apps/mobile/lib/webAssetServerRegistry.ts`에 둔다.
  - `getWebAssetServer(): WebAssetServer` — 기본값은 fake. Task 5가 이 기본값을 실제 구현으로 바꾼다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/mobile/__tests__/session-room.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import SessionRoomScreen from "../app/room/[id]";
import { createFakeWebAssetServer } from "../lib/webAssetServer";
import { resetWebAssetServer, setWebAssetServer } from "../lib/webAssetServerRegistry";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "1" }),
}));

jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return {
    WebView: ({ source, testID }: { source: { uri: string }; testID?: string }) => (
      <View testID={testID ?? "webview"} accessibilityLabel={source.uri} />
    ),
  };
});

jest.mock("../lib/userApi", () => ({
  getRegisteredUserId: jest.fn(async () => 7),
}));

describe("SessionRoomScreen", () => {
  afterEach(() => {
    resetWebAssetServer();
  });

  it("서버가 뜨면 세션 URL을 WebView에 넘긴다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("session-webview")).toHaveProp(
        "accessibilityLabel",
        "http://localhost:9999/room/1?userId=7",
      );
    });
  });

  it("서버가 뜨기 전에는 WebView를 그리지 않는다", () => {
    setWebAssetServer(createFakeWebAssetServer());

    render(<SessionRoomScreen />);

    expect(screen.queryByTestId("session-webview")).toBeNull();
  });

  it("서버 기동에 실패하면 WebView 대신 안내를 보여준다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ failToStart: true }));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByText("세션을 시작하지 못했어요")).toBeTruthy();
    });
    expect(screen.queryByTestId("session-webview")).toBeNull();
  });
});
```

> **문구 주의:** `세션을 시작하지 못했어요`는 `voice-tone.md`에 없는 문구다. 이 화면은 **정상 경로에서 사용자가 볼 일이 없는 개발/장애 상태**이며(설계 §12의 확정 문구 대상 아님), Task 9 스파이크에서 실제로 뜨는지 확인한 뒤 필요하면 리더에게 확정 카피를 요청한다. 이 계획에서는 위 문구를 그대로 쓴다.

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter mobile test -- session-room`
Expected: FAIL — `Cannot find module '../app/room/[id]'`

- [ ] **Step 3: react-native-webview를 설치한다**

```bash
pnpm --filter mobile exec expo install react-native-webview
```

- [ ] **Step 4: 서버 레지스트리를 만든다**

`apps/mobile/lib/webAssetServerRegistry.ts`:

```ts
import type { WebAssetServer } from "./webAssetServer";
import { createFakeWebAssetServer } from "./webAssetServer";

/**
 * 앱 전체가 공유하는 로컬 웹 자산 서버 하나.
 *
 * 서버는 프로세스당 하나만 떠야 하므로(포트를 잡는다) 화면이 각자 만들지 않고 여기서 받아간다.
 * 기본값이 fake인 것은 **실제 구현이 아직 없기 때문**이다 — S1 스파이크에서 라이브러리를
 * 정한 뒤 이 파일의 기본값만 실제 구현으로 바꾼다(라우트·테스트는 손대지 않는다).
 */
let current: WebAssetServer = createFakeWebAssetServer();

export function getWebAssetServer(): WebAssetServer {
  return current;
}

/** 테스트·스파이크 주입점. */
export function setWebAssetServer(server: WebAssetServer): void {
  current = server;
}

export function resetWebAssetServer(): void {
  current = createFakeWebAssetServer();
}
```

- [ ] **Step 5: 라우트를 구현한다**

`apps/mobile/app/room/[id].tsx`:

```tsx
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { buildSessionUrl } from "../../lib/webAssetServer";
import { getWebAssetServer } from "../../lib/webAssetServerRegistry";
import { getRegisteredUserId } from "../../lib/userApi";

/**
 * 싱글룸 세션(S3-1~S3-8) — 화면 구현체는 `apps/web`이고 여기서는 WebView로 로드한다(ADR 0001).
 *
 * 이 파일이 하는 일은 셋뿐이다: 로컬 서버를 띄우고, 세션 URL을 조립하고, WebView에 넘긴다.
 * 타이머·상태 판정·이벤트 누적은 전부 웹이 소유한다(설계 문서 §1, 세션 상태 모델 스펙 §1) —
 * **여기에 세션 로직을 넣지 말 것.**
 *
 * `allowsInlineMediaPlayback`·`mediaCapturePermissionGrantType`은 WebView 안의
 * `getUserMedia`가 카메라를 열기 위해 필요하다(ADR 0001 Consequences).
 */
export default function SessionRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const [origin, userId] = await Promise.all([
          getWebAssetServer().start(),
          getRegisteredUserId(),
        ]);
        if (!cancelled) {
          setUri(buildSessionUrl(origin, { roomId: id ?? "1", userId }));
        }
      } catch (error: unknown) {
        console.warn("[room] 로컬 웹 자산 서버 기동 실패", error);
        if (!cancelled) {
          setFailed(true);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0B0F14] px-6">
        <Text className="text-center text-[15px] leading-[22px] text-white/80">
          세션을 시작하지 못했어요
        </Text>
      </View>
    );
  }

  if (uri === null) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0B0F14]">
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <WebView
      testID="session-webview"
      source={{ uri }}
      // 세션 화면은 항상 다크다 — 로딩 중 흰 배경이 번쩍이지 않게 한다.
      style={{ flex: 1, backgroundColor: "#0B0F14" }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      // 로컬 서버 외의 오리진으로는 나가지 않는다.
      originWhitelist={["http://localhost:*"]}
    />
  );
}
```

- [ ] **Step 6: `getRegisteredUserId`가 없으면 추가한다**

`apps/mobile/lib/userApi.ts`를 열어 `getRegisteredUserId`가 export되어 있는지 확인한다. 없으면 기존 `ensureUserRegistered`가 저장하는 값을 읽어 돌려주는 함수를 추가한다 — **새 API를 호출하지 말고 이미 저장된 값만 읽는다**(세션 시작 경로에 네트워크를 넣지 않는다, 설계 §1).

- [ ] **Step 7: 라우트를 Stack에 등록한다**

`apps/mobile/app/_layout.tsx`의 32-36행 주석 블록을 아래로 교체한다:

```tsx
{
  /*
          싱글룸 세션(S3) — 화면 구현체는 apps/web이고 WebView로 로드한다(ADR 0001).
          탭 바를 가리는 전체 화면으로 띄운다: 세션 중에는 탭 이동이 없다.
        */
}
<Stack.Screen name="room/[id]" options={{ presentation: "fullScreenModal" }} />;
```

- [ ] **Step 8: 홈의 startSession을 배선한다**

`apps/mobile/app/(tabs)/index.tsx`의 26-29행을 교체:

```tsx
  startSession: () => {
    // V1.0 싱글룸에는 사용자에게 보여줄 "방" 개념이 없다 — 경로의 :id는 apps/web의
    // 기존 라우트 계약을 지키기 위한 고정값이다(SCR-S3-1 Review Checklist의 존치 항목).
    router.push("/room/1");
  },
```

- [ ] **Step 9: 온보딩 가이드의 startSession을 배선한다**

`apps/mobile/app/onboarding-guide.tsx`의 45-49행을 교체:

```tsx
        startSession: () => {
          router.push("/room/1");
        },
```

- [ ] **Step 10: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter mobile test -- session-room`
Expected: PASS (3 tests)

- [ ] **Step 11: 기존 테스트가 깨지지 않았는지 확인한다**

Run: `pnpm --filter mobile test`
Expected: 전부 PASS — 특히 `focusStartFlow.test.ts`·`onboarding-guide.test.tsx`가 `startSession` 배선 변경에 반응하지 않아야 한다(둘 다 주입된 navigator를 쓰므로 영향이 없어야 정상이다).

- [ ] **Step 12: 커밋**

```bash
git add apps/mobile/app apps/mobile/lib apps/mobile/__tests__ apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): 세션 WebView 라우트 복원과 집중 시작 배선 (BY-282)"
```

---

### Task 5: S1 스파이크 — 로컬 서버 라이브러리 선정과 실제 구현

**이 태스크가 첫 번째 게이트다.** 여기서 실패하면 설계 §1을 다시 봐야 하므로, 뒤 태스크를 시작하지 않는다.

**Files:**

- Create: `apps/mobile/lib/staticWebAssetServer.ts`
- Create: `apps/mobile/lib/__tests__/staticWebAssetServer.test.ts`
- Modify: `apps/mobile/lib/webAssetServerRegistry.ts` (기본값을 실제 구현으로)
- Modify: `apps/mobile/package.json` (선정된 서버 라이브러리)
- Modify: `apps/mobile/app.json` (필요 시 iOS 로컬 네트워킹 예외)
- Modify: `docs/superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md` (§12에서 라이브러리 확정, §10에 결과 기록)

**Interfaces:**

- Consumes: `WebAssetServer` (Task 3), `syncWebDist` CLI (Task 1), Dev Build (Task 2), 라우트 (Task 4)
- Produces: `createStaticWebAssetServer(): WebAssetServer` — Task 9의 카메라 검증이 이 위에서 돈다.

- [ ] **Step 1: 후보 라이브러리를 조사해 하나를 고른다**

판단 기준을 순서대로 적용한다.

1. **RN 0.81 / Expo SDK 54에서 동작하는가** — 최근 12개월 내 릴리스, 이슈 트래커에 SDK 54 관련 미해결 블로커가 없는가
2. **iOS·Android 양쪽을 지원하는가**
3. **커스텀 응답 헤더를 붙일 수 있는가** — 지금은 안 쓰지만 COOP/COEP를 켤 여지가 남아야 한다(설계 §2)
4. **동적 포트 할당을 지원하는가** — 고정 포트는 충돌한다(설계 §1)

고른 라이브러리와 탈락 사유를 설계 문서 §12의 "로컬 HTTP 서버 라이브러리" 행에 기록한다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`apps/mobile/lib/__tests__/staticWebAssetServer.test.ts`:

```ts
import { createStaticWebAssetServer } from "../staticWebAssetServer";

const start = jest.fn();
const stop = jest.fn();

// 아래 모듈 경로는 Step 1에서 고른 라이브러리로 바꾼다.
jest.mock("<선정한-서버-라이브러리>", () => ({
  __esModule: true,
  default: jest.fn(() => ({ start, stop })),
}));

describe("createStaticWebAssetServer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    start.mockResolvedValue("http://localhost:12345");
    stop.mockResolvedValue(undefined);
  });

  it("start가 라이브러리를 기동하고 오리진을 돌려준다", async () => {
    const server = createStaticWebAssetServer();

    await expect(server.start()).resolves.toBe("http://localhost:12345");
    expect(server.origin).toBe("http://localhost:12345");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("이미 떠 있으면 라이브러리를 다시 기동하지 않는다", async () => {
    const server = createStaticWebAssetServer();

    await server.start();
    await server.start();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("stop 후 origin이 null이 되고 다시 start할 수 있다", async () => {
    const server = createStaticWebAssetServer();

    await server.start();
    await server.stop();
    expect(server.origin).toBeNull();

    await server.start();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("라이브러리 기동이 실패하면 origin이 null로 남는다", async () => {
    start.mockRejectedValue(new Error("port in use"));
    const server = createStaticWebAssetServer();

    await expect(server.start()).rejects.toThrow("port in use");
    expect(server.origin).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter mobile test -- staticWebAssetServer`
Expected: FAIL — `Cannot find module '../staticWebAssetServer'`

- [ ] **Step 4: 라이브러리를 설치하고 구현한다**

```bash
pnpm --filter mobile exec expo install <선정한-서버-라이브러리>
```

`apps/mobile/lib/staticWebAssetServer.ts` — `WebAssetServer` 인터페이스를 그대로 구현한다. 서빙 루트는 `assets/web-dist/`, 포트는 **동적 할당**, 바인딩은 `127.0.0.1`(외부 접근 차단)이다. 라이브러리 API는 Step 1에서 고른 것에 맞추되 아래 골격을 지킨다:

```ts
import type { WebAssetServer } from "./webAssetServer";

/**
 * 번들 asset(`assets/web-dist/`)을 `http://localhost:{동적포트}`로 서빙하는 실제 구현.
 *
 * `127.0.0.1`에만 바인딩한다 — 같은 Wi-Fi의 다른 기기가 이 서버에 붙을 이유가 없고,
 * 붙을 수 있으면 그 자체가 보안 문제다.
 *
 * 포트를 고정하지 않는 이유는 다른 앱과 충돌하기 때문이다(설계 §1). WebView가 열 URL은
 * `start()`가 돌려주는 오리진으로 런타임에 조립한다.
 */
export function createStaticWebAssetServer(): WebAssetServer {
  let origin: string | null = null;
  let server: /* 라이브러리 인스턴스 타입 */ null = null;

  return {
    get origin() {
      return origin;
    },
    async start() {
      if (origin !== null) {
        return origin;
      }
      // 라이브러리 인스턴스를 만들고 기동한다. 실패는 그대로 던진다 —
      // 라우트가 catch해서 "세션을 시작하지 못했어요"를 보여준다.
      // 실패 시 origin을 건드리지 않아야 재시도가 가능하다.
      origin = await /* 라이브러리 start 호출 */;
      return origin;
    },
    async stop() {
      await /* 라이브러리 stop 호출 */;
      server = null;
      origin = null;
    },
  };
}
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter mobile test -- staticWebAssetServer`
Expected: PASS (4 tests)

- [ ] **Step 6: 레지스트리 기본값을 실제 구현으로 바꾼다**

`apps/mobile/lib/webAssetServerRegistry.ts`에서 import와 기본값을 교체한다:

```ts
import { createStaticWebAssetServer } from "./staticWebAssetServer";
import type { WebAssetServer } from "./webAssetServer";
import { createFakeWebAssetServer } from "./webAssetServer";

let current: WebAssetServer = createStaticWebAssetServer();
```

`resetWebAssetServer()`는 **테스트 전용이므로 fake로 되돌리는 동작을 유지한다** — `createFakeWebAssetServer` import를 지우지 않는다.

- [ ] **Step 7: 웹을 빌드하고 asset으로 동기화한다**

```bash
pnpm --filter web build && pnpm --filter mobile sync-web
```

- [ ] **Step 8: Dev Build를 다시 만들어 실기기에 설치한다**

```bash
pnpm --filter mobile exec eas build --profile development --platform ios
```

서버 라이브러리는 네이티브 모듈이라 **재빌드가 필요하다.**

- [ ] **Step 9: 실기기에서 S1을 검증한다**

`pnpm --filter mobile start` 후 Dev Build에서 홈 → "집중 시작"을 눌러 아래를 확인한다.

| 확인 항목                                        | 기대                                          |
| ------------------------------------------------ | --------------------------------------------- |
| WebView가 흰 화면이 아니라 세션 화면을 그린다    | S3-1 상태 필·타이머·컨트롤 바가 보인다        |
| 주소가 `http://localhost:{포트}/room/1?userId=N` | Safari 원격 디버거의 `location.href`          |
| 라우팅이 동작한다                                | 종료 → S4 결과 화면으로 이동(해시 URL이 아님) |
| 비행기 모드에서도 뜬다                           | 기내 모드 켜고 앱 재시작 → 세션 화면 정상     |
| 정적 자산이 전부 로드된다                        | 콘솔에 404가 없다                             |

**하나라도 실패하면 여기서 멈추고 Step 1의 라이브러리 선정으로 돌아간다.** 두 번째 후보도 실패하면 설계 §1을 리더와 다시 논의한다 — 다음 태스크로 넘어가지 않는다.

- [ ] **Step 10: 결과를 설계 문서에 기록한다**

`docs/superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md`:

- §12 표의 "로컬 HTTP 서버 라이브러리" 행을 선정된 이름으로 바꾸고 선정 근거 한 줄을 붙인다
- §10 표의 S1 행 아래에 실측 결과(라이브러리·포트 할당 방식·비행기 모드 확인 여부)를 적는다

- [ ] **Step 11: 전체 검사를 돌린다**

Run: `pnpm turbo run lint typecheck test && pnpm --filter mobile sync-web:check`
Expected: 전부 PASS

- [ ] **Step 12: 커밋**

```bash
git add apps/mobile docs/superpowers/specs pnpm-lock.yaml
git commit -m "feat(mobile): 번들 웹 자산을 서빙하는 로컬 HTTP 서버 구현 (BY-282)"
```

---

### Task 6: 네이티브 ↔ 웹 브리지 메시지 계약

세션 상태 모델 스펙 §10이 타입까지 확정해둔 계약을 **양쪽에 동시에** 만든다. 이 계획에서는 메시지가 오가는 통로만 뚫고, 실제 신호(가속도·체크포인트)는 후속 계획이 채운다.

**Files:**

- Create: `packages/types/src/bridge.ts`
- Modify: `packages/types/src/index.ts` (re-export)
- Create: `apps/web/src/features/study-session/bridge/nativeBridge.ts`
- Create: `apps/web/src/features/study-session/bridge/__tests__/nativeBridge.test.ts`
- Create: `apps/mobile/lib/webBridge.ts`
- Create: `apps/mobile/lib/__tests__/webBridge.test.ts`

**Interfaces:**

- Consumes: 없음
- Produces:
  - `@focuson/types`: `ToWebMessage` · `ToNativeMessage` 유니온 타입
  - 웹: `parseToWebMessage(raw: string): ToWebMessage | null` · `postToNative(message: ToNativeMessage): void`
  - 네이티브: `parseToNativeMessage(raw: string): ToNativeMessage | null` · `serializeToWebMessage(message: ToWebMessage): string`
  - 후속 계획의 가속도 신호(`device-handling`)와 체크포인트(`checkpoint`)가 이 통로를 쓴다.

- [ ] **Step 1: 공유 타입을 쓴다**

`packages/types/src/bridge.ts`:

```ts
/**
 * WebView ↔ 네이티브 브리지 메시지 계약
 * (`frontend/docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md` §10).
 *
 * 매초 갱신되는 타이머와 상태 전환은 **이 통로를 건너지 않는다** — 상태기계와 화면이 같은
 * 메모리(웹)에 있으므로 직접 읽는다. 브리지에는 웹이 만들 수 없는 원시 신호(가속도·앱 생명주기)와
 * 네이티브만 할 수 있는 저장(체크포인트·제출)만 오간다.
 */

/** 네이티브 → 웹. */
export type ToWebMessage =
  /** 가속도 임계 초과 여부. 원시 값은 넘기지 않는다(스펙 §3 "가속도 신호의 경계"). */
  | { type: "device-handling"; active: boolean; atMs: number }
  | { type: "app-state"; state: "active" | "background"; atMs: number };

/** 웹 → 네이티브. */
export type ToNativeMessage =
  /** 세션 화면이 살아 있고 브리지가 연결됐음을 알린다. */
  { type: "session-ready"; atMs: number };
```

> 후속 계획이 `restore-session`·`checkpoint`·`session-complete`를 이 유니온에 추가한다. 지금 넣지 않는 이유는 `SessionCheckpoint` 타입이 `study-core`에 있고 그 패키지가 아직 없기 때문이다.

- [ ] **Step 2: types에서 re-export한다**

`packages/types/src/index.ts` 끝에 추가:

```ts
export type { ToNativeMessage, ToWebMessage } from "./bridge";
```

- [ ] **Step 3: 웹 쪽 실패하는 테스트를 쓴다**

`apps/web/src/features/study-session/bridge/__tests__/nativeBridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { parseToWebMessage, postToNative } from "../nativeBridge";

describe("parseToWebMessage", () => {
  it("device-handling 메시지를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"device-handling","active":true,"atMs":1000}')).toEqual({
      type: "device-handling",
      active: true,
      atMs: 1000,
    });
  });

  it("app-state 메시지를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"app-state","state":"background","atMs":2000}')).toEqual({
      type: "app-state",
      state: "background",
      atMs: 2000,
    });
  });

  it("알 수 없는 type은 null을 돌려준다 — 앱 버전이 앞서갈 때 죽지 않아야 한다", () => {
    expect(parseToWebMessage('{"type":"future-message","atMs":1}')).toBeNull();
  });

  it("JSON이 아니면 null을 돌려준다", () => {
    expect(parseToWebMessage("not json")).toBeNull();
  });

  it("필드 타입이 어긋나면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"device-handling","active":"yes","atMs":1}')).toBeNull();
  });
});

describe("postToNative", () => {
  it("ReactNativeWebView가 있으면 직렬화해 보낸다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    postToNative({ type: "session-ready", atMs: 42 });

    expect(postMessage).toHaveBeenCalledWith('{"type":"session-ready","atMs":42}');
    vi.unstubAllGlobals();
  });

  it("브라우저 단독 모드에서는 아무 일도 하지 않는다", () => {
    expect(() => postToNative({ type: "session-ready", atMs: 42 })).not.toThrow();
  });
});
```

- [ ] **Step 4: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter web test -- nativeBridge`
Expected: FAIL — `Failed to resolve import "../nativeBridge"`

- [ ] **Step 5: 웹 쪽 구현을 쓴다**

`apps/web/src/features/study-session/bridge/nativeBridge.ts`:

```ts
import type { ToNativeMessage, ToWebMessage } from "@focuson/types";

/**
 * WebView 브리지의 웹 쪽 끝(세션 상태 모델 스펙 §10).
 *
 * **브라우저 단독 모드에서는 브리지가 없다.** `apps/web`은 독립 서비스로도 배포되므로
 * (ADR 0001) 여기 있는 함수는 전부 "네이티브가 없으면 조용히 아무것도 안 함"이어야 한다 —
 * 던지면 브라우저에서 세션이 시작되지 않는다.
 *
 * 알 수 없는 메시지를 `null`로 흘려보내는 것도 같은 이유다. 앱 버전이 웹보다 앞설 수 있고
 * (번들 동봉이라 대체로 같이 가지만 하이브리드 갱신 여지가 있다), 모르는 메시지에 죽으면
 * 세션 전체가 멈춘다.
 */

interface ReactNativeWebViewBridge {
  postMessage(message: string): void;
}

function nativeBridge(): ReactNativeWebViewBridge | null {
  const candidate = (globalThis as { ReactNativeWebView?: ReactNativeWebViewBridge })
    .ReactNativeWebView;
  return typeof candidate?.postMessage === "function" ? candidate : null;
}

export function isNativeBridgeAvailable(): boolean {
  return nativeBridge() !== null;
}

export function postToNative(message: ToNativeMessage): void {
  nativeBridge()?.postMessage(JSON.stringify(message));
}

export function parseToWebMessage(raw: string): ToWebMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.atMs !== "number") {
    return null;
  }

  if (record.type === "device-handling" && typeof record.active === "boolean") {
    return { type: "device-handling", active: record.active, atMs: record.atMs };
  }
  if (record.type === "app-state" && (record.state === "active" || record.state === "background")) {
    return { type: "app-state", state: record.state, atMs: record.atMs };
  }
  return null;
}
```

- [ ] **Step 6: 웹 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter web test -- nativeBridge`
Expected: PASS (7 tests)

- [ ] **Step 7: 네이티브 쪽 실패하는 테스트를 쓴다**

`apps/mobile/lib/__tests__/webBridge.test.ts`:

```ts
import { parseToNativeMessage, serializeToWebMessage } from "../webBridge";

describe("parseToNativeMessage", () => {
  it("session-ready 메시지를 파싱한다", () => {
    expect(parseToNativeMessage('{"type":"session-ready","atMs":5}')).toEqual({
      type: "session-ready",
      atMs: 5,
    });
  });

  it("알 수 없는 type은 null을 돌려준다", () => {
    expect(parseToNativeMessage('{"type":"future","atMs":5}')).toBeNull();
  });

  it("JSON이 아니면 null을 돌려준다", () => {
    expect(parseToNativeMessage("<html>")).toBeNull();
  });
});

describe("serializeToWebMessage", () => {
  it("device-handling을 JSON 문자열로 만든다", () => {
    expect(serializeToWebMessage({ type: "device-handling", active: true, atMs: 9 })).toBe(
      '{"type":"device-handling","active":true,"atMs":9}',
    );
  });
});
```

- [ ] **Step 8: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter mobile test -- webBridge`
Expected: FAIL — `Cannot find module '../webBridge'`

- [ ] **Step 9: 네이티브 쪽 구현을 쓴다**

`apps/mobile/lib/webBridge.ts`:

```ts
import type { ToNativeMessage, ToWebMessage } from "@focuson/types";

/**
 * WebView 브리지의 네이티브 쪽 끝(세션 상태 모델 스펙 §10).
 *
 * 웹 쪽(`apps/web/src/features/study-session/bridge/nativeBridge.ts`)과 **대칭**이다 —
 * 한쪽 유니온을 고치면 반드시 다른 쪽도 고친다. 알 수 없는 메시지를 `null`로 흘리는 이유도
 * 같다: 웹 번들이 앱보다 앞설 수 있고, 모르는 메시지에 죽으면 세션이 멈춘다.
 */
export function parseToNativeMessage(raw: string): ToNativeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record.type === "session-ready" && typeof record.atMs === "number") {
    return { type: "session-ready", atMs: record.atMs };
  }
  return null;
}

/** WebView `injectJavaScript`로 밀어 넣을 때 쓸 직렬화. */
export function serializeToWebMessage(message: ToWebMessage): string {
  return JSON.stringify(message);
}
```

- [ ] **Step 10: 네이티브 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter mobile test -- webBridge`
Expected: PASS (4 tests)

- [ ] **Step 11: 전체 검사를 돌린다**

Run: `pnpm turbo run lint typecheck test`
Expected: 전부 PASS

- [ ] **Step 12: 커밋**

```bash
git add packages/types apps/web/src/features/study-session/bridge apps/mobile/lib/webBridge.ts apps/mobile/lib/__tests__/webBridge.test.ts
git commit -m "feat: WebView 브리지 메시지 계약을 웹·네이티브 양쪽에 추가 (BY-282)"
```

---

### Task 7: getUserMedia 카메라 어댑터

기존 `CameraAdapter` 인터페이스의 **실제 구현**을 만든다. mock은 지우지 않는다 — 테스트와 브라우저 개발에 계속 쓴다.

**Files:**

- Create: `apps/web/src/features/study-session/adapters/mediaStreamCamera.ts`
- Create: `apps/web/src/features/study-session/adapters/__tests__/mediaStreamCamera.test.ts`
- Create: `apps/web/src/features/study-session/vision/visionConfig.ts`

**Interfaces:**

- Consumes: `CameraAdapter` · `CameraFacing` · `CameraFlipResult` (`adapters/cameraAdapter.ts`, 기존)
- Produces:
  - `createMediaStreamCameraAdapter(): MediaStreamCameraAdapter`
  - `MediaStreamCameraAdapter extends CameraAdapter { readonly stream: MediaStream | null }` — Task 8의 `<video>` 연결이 `stream`을 읽는다
  - `CAMERA_CONSTRAINTS` (`visionConfig.ts`) — 후속 계획의 프레임 주기·임계값 상수도 이 파일에 모인다

- [ ] **Step 1: 상수 파일을 쓴다**

`apps/web/src/features/study-session/vision/visionConfig.ts`:

```ts
/**
 * Vision 파이프라인의 튜닝 상수.
 *
 * `ai-wiki/product/mvp-scope.md`가 "하드코딩하지 말고 설정 파라미터로 구현"하라고 명시한
 * 값들이 여기 모인다 — M1 테스트에서 실측으로 조정된다(설계 문서 §12).
 *
 * 이 파일에는 **모델·추론 상수도 함께 들어온다**(프레임 주기·score 임계). 후속 계획이
 * 채우며, 지금은 카메라 제약만 있다.
 */

/**
 * `getUserMedia` 제약.
 *
 * 모델 입력은 320×320이라 해상도는 **프리뷰 화질용**이다(설계 §3). 낮으면 풀스크린
 * 프리뷰가 뭉개지고, 높으면 배터리·발열이 늘어난다. 720×1280로 시작해 스파이크에서 조정한다.
 * `ideal`을 쓰는 이유는 지원하지 않는 기기에서 `getUserMedia`가 실패하지 않게 하기 위해서다.
 */
export const CAMERA_CONSTRAINTS = {
  front: {
    video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
    audio: false,
  },
  back: {
    video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 1280 } },
    audio: false,
  },
} as const satisfies Record<"front" | "back", MediaStreamConstraints>;
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`apps/web/src/features/study-session/adapters/__tests__/mediaStreamCamera.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMediaStreamCameraAdapter } from "../mediaStreamCamera";

function fakeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], __track: track } as unknown as MediaStream & {
    __track: { stop: ReturnType<typeof vi.fn> };
  };
}

function stubMediaDevices(getUserMedia: ReturnType<typeof vi.fn>, deviceKinds: string[] = []) {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => deviceKinds.map((kind) => ({ kind }))),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createMediaStreamCameraAdapter", () => {
  it("start가 전면 카메라로 스트림을 얻고 isRunning을 켠다", async () => {
    const stream = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    stubMediaDevices(getUserMedia);
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    expect(camera.isRunning).toBe(true);
    expect(camera.facing).toBe("front");
    expect(camera.stream).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: "user" }) }),
    );
  });

  it("권한 거부로 start가 실패하면 isRunning이 꺼진 채 남는다", async () => {
    stubMediaDevices(vi.fn(async () => Promise.reject(new Error("NotAllowedError"))));
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    expect(camera.isRunning).toBe(false);
    expect(camera.stream).toBeNull();
  });

  it("stop이 모든 트랙을 멈추고 스트림을 놓는다", async () => {
    const stream = fakeStream();
    stubMediaDevices(vi.fn(async () => stream));
    const camera = createMediaStreamCameraAdapter();

    await camera.start();
    camera.stop();

    expect(stream.__track.stop).toHaveBeenCalled();
    expect(camera.isRunning).toBe(false);
    expect(camera.stream).toBeNull();
  });

  it("flip이 후면으로 바꾸고 옛 스트림을 정리한다", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    stubMediaDevices(getUserMedia, ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await camera.start();
    await expect(camera.flip()).resolves.toEqual({ ok: true, facing: "back" });

    expect(first.__track.stop).toHaveBeenCalled();
    expect(camera.stream).toBe(second);
  });

  it("카메라가 하나뿐이면 flip이 no-alternative로 실패하고 기존 스트림을 유지한다", async () => {
    const stream = fakeStream();
    stubMediaDevices(
      vi.fn(async () => stream),
      ["videoinput"],
    );
    const camera = createMediaStreamCameraAdapter();

    await camera.start();

    await expect(camera.flip()).resolves.toEqual({ ok: false, reason: "no-alternative" });
    expect(camera.stream).toBe(stream);
    expect(stream.__track.stop).not.toHaveBeenCalled();
  });

  it("카메라가 꺼져 있으면 flip이 camera-off로 실패한다", async () => {
    stubMediaDevices(vi.fn(), ["videoinput", "videoinput"]);
    const camera = createMediaStreamCameraAdapter();

    await expect(camera.flip()).resolves.toEqual({ ok: false, reason: "camera-off" });
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter web test -- mediaStreamCamera`
Expected: FAIL — `Failed to resolve import "../mediaStreamCamera"`

- [ ] **Step 4: 구현을 쓴다**

`apps/web/src/features/study-session/adapters/mediaStreamCamera.ts`:

```ts
import { CAMERA_CONSTRAINTS } from "../vision/visionConfig";
import type { CameraAdapter, CameraFacing, CameraFlipResult } from "./cameraAdapter";

/**
 * `getUserMedia` 기반 실제 카메라 어댑터.
 *
 * 기존 `CameraAdapter` 인터페이스를 그대로 구현하므로 **화면·훅은 한 줄도 바뀌지 않는다** —
 * `useStudyRoomSession(userId, { camera })`에 주입만 하면 된다.
 *
 * `start()`가 실패해도 **던지지 않는다.** mock 어댑터의 `failToStart`와 동일한 계약이며,
 * 훅이 `camera.isRunning`을 보고 프리뷰 서피스를 결정한다. 권한 거부는 예외가 아니라
 * 정상 시나리오다(권한 거부 시 수동 타이머 모드 — mvp-scope 2026-07-26).
 *
 * **원본 프레임은 이 객체 밖으로 나가지 않는다.** `stream`은 같은 문서의 `<video>`에
 * 붙이는 용도로만 노출하며, 저장·전송·로그 어디에도 쓰지 않는다(`frontend/CLAUDE.md`).
 */
export interface MediaStreamCameraAdapter extends CameraAdapter {
  readonly stream: MediaStream | null;
}

async function countVideoInputs(): Promise<number> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput").length;
}

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

export function createMediaStreamCameraAdapter(): MediaStreamCameraAdapter {
  let facing: CameraFacing = "front";
  let stream: MediaStream | null = null;

  async function open(next: CameraFacing): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS[next]);
    } catch (error: unknown) {
      // 권한 거부·기기 점유 모두 여기로 온다. 어느 쪽인지 화면에서 구분하지 않으므로
      // (voice-tone에 `카메라가 꺼져 있어요` 하나뿐) 사유를 나누지 않는다.
      console.warn("[camera] getUserMedia 실패", error);
      return null;
    }
  }

  return {
    get facing() {
      return facing;
    },
    get isRunning() {
      return stream !== null;
    },
    get stream() {
      return stream;
    },
    async start() {
      if (stream !== null) {
        return;
      }
      stream = await open(facing);
    },
    stop() {
      stopStream(stream);
      stream = null;
    },
    async flip(): Promise<CameraFlipResult> {
      if (stream === null) {
        return { ok: false, reason: "camera-off" };
      }
      if ((await countVideoInputs()) < 2) {
        return { ok: false, reason: "no-alternative" };
      }

      const next: CameraFacing = facing === "front" ? "back" : "front";
      const opened = await open(next);
      if (opened === null) {
        // 새 카메라를 못 열었으면 기존 스트림을 그대로 둔다 — 전환 실패로 프리뷰가
        // 통째로 꺼지면 세션이 측정 불가 상태가 된다.
        return { ok: false, reason: "no-alternative" };
      }

      stopStream(stream);
      stream = opened;
      facing = next;
      return { ok: true, facing };
    },
  };
}
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter web test -- mediaStreamCamera`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/features/study-session/adapters apps/web/src/features/study-session/vision
git commit -m "feat(web): getUserMedia 기반 카메라 어댑터 구현 (BY-282)"
```

---

### Task 8: 카메라 프리뷰에 실제 스트림 연결

`CameraPreviewSurface`가 목업 텍스처 대신 `<video>`를 그리게 하고, `RoomPage`가 실제 어댑터를 주입하게 한다.

**Files:**

- Modify: `apps/web/src/features/study-session/components/CameraPreviewSurface.tsx`
- Create: `apps/web/src/features/study-session/__tests__/CameraPreviewSurface.test.tsx`
- Modify: `apps/web/src/routes/RoomPage.tsx:104-116`
- Modify: `apps/web/src/features/study-session/useStudyRoomSession.ts` (반환값에 `cameraStream` 추가)

**Interfaces:**

- Consumes: `createMediaStreamCameraAdapter` · `MediaStreamCameraAdapter` (Task 7)
- Produces: `CameraPreviewSurfaceProps { isRunning: boolean; stream: MediaStream | null; className?: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/features/study-session/__tests__/CameraPreviewSurface.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CameraPreviewSurface } from "../components/CameraPreviewSurface";

describe("CameraPreviewSurface", () => {
  it("카메라가 꺼져 있으면 목업 라벨을 보여주고 video를 그리지 않는다", () => {
    const { container } = render(<CameraPreviewSurface isRunning={false} stream={null} />);

    expect(screen.getByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });

  it("카메라가 켜져 있으면 video를 그리고 목업 라벨을 감춘다", () => {
    const { container } = render(<CameraPreviewSurface isRunning stream={null} />);

    expect(screen.queryByText("[ 전 면 카 메 라 프 리 뷰 ]")).toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("video는 음소거·인라인 재생이다 — 소리를 내거나 전체화면으로 튀면 안 된다", () => {
    const { container } = render(<CameraPreviewSurface isRunning stream={null} />);
    const video = container.querySelector("video");

    expect(video).toHaveAttribute("playsinline");
    expect(video?.muted).toBe(true);
  });

  it("전달된 스트림을 video의 srcObject에 붙인다", () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const { container } = render(<CameraPreviewSurface isRunning stream={stream} />);

    expect(container.querySelector("video")?.srcObject).toBe(stream);
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter web test -- CameraPreviewSurface`
Expected: FAIL — `stream` prop이 없어 타입 에러 + `srcObject` 단언 실패

- [ ] **Step 3: 컴포넌트를 고친다**

`apps/web/src/features/study-session/components/CameraPreviewSurface.tsx`를 아래로 교체한다. 기존 JSDoc의 목업 설명은 실제 피드가 붙었으므로 갱신한다.

```tsx
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * 카메라 피드 영역 (Figma `Session / Camera Preview BG` 58:109).
 *
 * 카메라가 도는 동안에는 `<video>`가 실제 피드를 그리고, 꺼져 있는 동안에는 Figma 목업과
 * 같은 중립 서피스(사선 밴드 + 라벨)를 그린다 — 권한 거부·기기 점유로 카메라가 없는 상태에서도
 * 화면이 검게 비지 않아야 한다.
 *
 * **스트림은 이 컴포넌트 밖으로 나가지 않는다.** `srcObject`에 붙이는 것 외의 용도로 쓰지 말 것
 * (원본 프레임 저장·전송 금지 — `frontend/CLAUDE.md`).
 *
 * UI가 카메라 SDK를 직접 호출하지 않는 경계는 유지된다 — `getUserMedia`는 어댑터가 부르고
 * 이 컴포넌트는 결과 스트림만 받는다.
 *
 * **가로(S3-5)에는 방향 델타가 없다** — 밴드 기하와 라벨 타이포가 세로와 같고, 여기서는 밴드를
 * `repeating-linear-gradient` 하나로 그리므로 어떤 뷰포트에서도 자동으로 채워진다.
 */
export interface CameraPreviewSurfaceProps {
  /** 카메라 어댑터가 실행 중인지 — false면 목업 텍스처를 노출한다. */
  isRunning: boolean;
  /** 어댑터가 연 스트림. `isRunning`이 true여도 렌더 타이밍상 잠깐 null일 수 있다. */
  stream: MediaStream | null;
  className?: string;
}

export function CameraPreviewSurface({ isRunning, stream, className }: CameraPreviewSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    video.srcObject = stream;
    return () => {
      // 언마운트 시 참조를 끊는다 — 트랙 정지는 어댑터의 책임이다.
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div
      aria-hidden="true"
      data-session-surface="camera"
      className={cn("absolute inset-0 overflow-hidden bg-[var(--session-camera-base)]", className)}
    >
      {isRunning ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          // 전면 카메라는 거울처럼 보여야 자연스럽다. 추론은 원본 프레임을 쓰므로
          // 이 변환은 표시에만 영향을 준다.
          className="h-full w-full scale-x-[-1] object-cover"
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 55px, transparent 55px 110px)",
            }}
          />
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] leading-[14px] tracking-[2px] whitespace-nowrap text-white/16">
            [ 전 면 카 메 라 프 리 뷰 ]
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter web test -- CameraPreviewSurface`
Expected: PASS (4 tests)

- [ ] **Step 5: 훅이 스트림을 노출하게 한다**

`apps/web/src/features/study-session/useStudyRoomSession.ts`:

1. `StudyRoomSessionOptions`의 `camera` 타입은 그대로 `CameraAdapter`를 유지한다(브라우저 단독 모드에서 mock을 주입할 수 있어야 한다).
2. 반환 객체(352-357행 부근)에 `cameraStream`을 추가한다. `CameraAdapter`에는 `stream`이 없으므로 좁혀서 읽는다:

```ts
// `stream`은 실제 어댑터에만 있다(mock에는 없다) — 없으면 null이고, 그러면
// CameraPreviewSurface가 목업 서피스를 그린다.
const cameraStream =
  "stream" in camera ? ((camera as { stream: MediaStream | null }).stream ?? null) : null;
```

3. 반환 객체에 `cameraStream,`을 추가한다.

- [ ] **Step 6: RoomPage가 실제 어댑터를 주입하게 한다**

`apps/web/src/routes/RoomPage.tsx` 104-116행을 아래로 교체한다.

교체 전:

```tsx
const [devDetector] = useState(createDevMockDetector);
const {
  focusSec,
  studySec,
  sessionState,
  phase,
  endReason,
  isCameraRunning,
  pause,
  resume,
  flipCamera,
  endAndSubmit,
} = useStudyRoomSession(userId, { detector: devDetector });
```

교체 후:

```tsx
const [devDetector] = useState(createDevMockDetector);
// 카메라는 실제 getUserMedia, 감지는 아직 mock이다 — Vision 파이프라인은 후속 계획에서
// 같은 `FocusDetector` 인터페이스 뒤에 붙는다(설계 문서 §4).
const [camera] = useState(createMediaStreamCameraAdapter);
const {
  focusSec,
  studySec,
  sessionState,
  phase,
  endReason,
  isCameraRunning,
  cameraStream,
  pause,
  resume,
  flipCamera,
  endAndSubmit,
} = useStudyRoomSession(userId, { camera, detector: devDetector });
```

import에 추가 (16행 `createDevMockDetector` import 위, 알파벳 순서 유지):

```tsx
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
```

198행의 프리뷰 렌더를 교체:

```tsx
{
  simpleMode ? (
    <SimpleModeSurface />
  ) : (
    <CameraPreviewSurface isRunning={isCameraRunning} stream={cameraStream} />
  );
}
```

- [ ] **Step 7: 웹 전체 테스트를 돌린다**

Run: `pnpm --filter web test`
Expected: 전부 PASS — 특히 `RoomPage.test.tsx`·`RoomPage.autoEnd.test.tsx`가 깨지지 않아야 한다. jsdom에는 `navigator.mediaDevices`가 없어 `getUserMedia`가 실패하지만, Task 7의 어댑터가 던지지 않고 `isRunning=false`로 떨어지므로 기존 테스트는 목업 서피스를 보게 된다.

- [ ] **Step 8: 브라우저에서 눈으로 확인한다**

```bash
pnpm --filter web dev
```

`http://localhost:5173/room/1?userId=1`을 열어 카메라 권한을 허용하고 아래를 확인한다.

- 프리뷰가 실제 카메라 피드다 (사선 밴드가 아니다)
- 좌우가 거울처럼 반전돼 있다
- 카메라 전환 버튼 → PC에 카메라가 하나면 토스트 `전환할 카메라가 없어요`
- 권한을 거부하면 목업 서피스로 떨어지고 타이머는 계속 돈다

- [ ] **Step 9: 전체 검사를 돌린다**

Run: `pnpm turbo run lint typecheck test`
Expected: 전부 PASS

- [ ] **Step 10: 커밋**

```bash
git add apps/web/src
git commit -m "feat(web): 세션 프리뷰에 실제 카메라 스트림 연결 (BY-282)"
```

---

### Task 9: S2 스파이크 — 실기기 카메라·권한 검증

**두 번째 게이트.** WebView 안의 `getUserMedia`가 네이티브 권한과 어떻게 맞물리는지는 ADR 0004가 "남는 위험"으로 명시해둔 미검증 항목이다.

**Files:**

- Modify: `docs/superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md` (§10 S2 결과)
- Modify: `docs/adr/0004-expo-camera-for-permission-api-only.md` ("남는 위험"의 이중 프롬프트 항목 해소)
- Create: `docs/adr/0005-bundled-web-assets-over-localhost-server.md`

**Interfaces:**

- Consumes: Task 1~8 전부
- Produces: 검증된 실기기 동작과 ADR 0005. 후속 계획(Vision 감지)이 이 위에서 시작한다.

- [ ] **Step 1: 최신 웹 빌드를 asset에 동기화하고 Dev Build를 만든다**

```bash
pnpm --filter web build && pnpm --filter mobile sync-web
pnpm --filter mobile exec eas build --profile development --platform ios
```

- [ ] **Step 2: 실기기에서 카메라 동작을 확인한다**

홈 → "집중 시작" → (최초라면 G1~G5 → 권한 요청) → 세션 화면.

| 확인 항목                                         | 기대                                         | 실패 시                                                                   |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| 권한 다이얼로그가 **한 번만** 뜬다                | `expo-camera` 게이트에서 1회                 | 두 번 뜨면 게이트와 WebView 권한 순서를 재설계 (S2 화면 스펙 갱신)        |
| WebView 안에서 카메라 프리뷰가 뜬다               | 실제 피드                                    | `mediaCapturePermissionGrantType`·`allowsInlineMediaPlayback` 설정 재확인 |
| 권한 거부 시 목업 서피스로 떨어지고 타이머는 돈다 | 세션이 멈추지 않는다                         | 어댑터가 던지고 있는지 확인                                               |
| 카메라 전환 버튼이 동작한다                       | 후면으로 바뀌고 토스트 `카메라를 전환했어요` | `enumerateDevices` 권한 전 호출 여부 확인                                 |
| 세션을 종료하면 S4 결과로 넘어간다                | 라우팅 정상                                  | Task 5의 라우팅 확인으로 회귀                                             |

- [ ] **Step 3: Android에서도 같은 항목을 확인한다**

```bash
pnpm --filter mobile exec eas build --profile development --platform android
```

WebView 엔진이 달라 카메라 권한 동작이 갈릴 수 있다. **차이가 있으면 그대로 기록한다** — 고치는 것은 별도 판단이다.

- [ ] **Step 4: 결과를 설계 문서에 기록한다**

`docs/superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md` §10의 S2 행 아래에 iOS·Android 각각의 실측 결과를 적는다. 프롬프트 횟수, 전환 동작, 권한 거부 경로를 포함한다.

- [ ] **Step 5: ADR 0004의 남는 위험을 갱신한다**

`docs/adr/0004-expo-camera-for-permission-api-only.md`의 "남는 위험" 첫 항목(`WebView 이중 권한 프롬프트 미검증`)을 실측 결과로 교체한다. 검증됐으면 해소로, 문제가 있으면 발견된 동작과 대응을 적는다.

- [ ] **Step 6: ADR 0005를 쓴다**

`docs/adr/0005-bundled-web-assets-over-localhost-server.md` — 설계 문서 §1의 결정을 ADR 형식으로 옮긴다. `frontend/CLAUDE.md`가 "구조/아키텍처 변경 시 ADR을 추가한다"고 요구하고, 이 변경은 두 가지 구조를 바꾼다: **서빙 방식**(원격/`file://`이 아닌 번들+localhost)과 **개발 환경**(Expo Go → Dev Client).

포함할 절: `Status`(Accepted, 2026-07-28) · `Context`(오프라인 정책과 secure context 요구) · `Decision` · `고려한 대안`(원격 https / `file://`) · `Consequences`(Expo Go 이탈, 앱 용량, 빌드 파이프라인, V1.3 WebRTC 전제) · `Relates to`(ADR 0001·0003·0004, 설계 문서).

ADR 0003의 "지금은 Dev Client가 불필요하다"는 서술이 낡았음을 ADR 0005 본문에서 명시한다 — **ADR 0003 자체를 수정하지 않는다**(ADR은 시점 기록이다).

- [ ] **Step 7: 전체 검사를 돌린다**

Run: `pnpm turbo run lint typecheck test && pnpm format:check && pnpm --filter mobile sync-web:check`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add docs
git commit -m "docs: 로컬 서버 서빙 결정을 ADR 0005로 기록하고 스파이크 결과 반영 (BY-282)"
```

- [ ] **Step 9: PR을 연다**

```bash
gh pr create --base dev \
  --title "[feat] BY-282 공부 세션 WebView 인프라와 카메라 연결" \
  --body "$(cat <<'BODY'
## 요약

설계 문서 [2026-07-27-study-session-vision-pipeline-design.md](docs/superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md) §1·§3의 서빙·카메라 부분을 구현했다. Vision 추론·가속도·지속성은 후속 계획이다.

- 번들 웹 자산을 localhost HTTP 서버로 서빙 (ADR 0005)
- Expo Go → Dev Client 전환
- WebView 세션 라우트 복원과 집중 시작 배선
- `getUserMedia` 카메라 어댑터와 프리뷰 연결
- 브리지 메시지 계약 (양방향 통로만, 신호는 후속)

## 스파이크 결과

S1(로컬 서버)·S2(카메라 권한) 실기기 검증 결과는 설계 문서 §10에 기록했다.

## 남은 것

감지는 여전히 mock이다 — 상태기계·타이머·화면은 이번 PR에서 바뀌지 않았다.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review

**1. Spec coverage** — 이 계획은 설계 문서 §1(서빙)·§3(카메라 부분)·§9(파일 구조 중 인프라)·§10(S1·S2)만 덮는다. 나머지는 의도적으로 후속 계획이다.

| 설계 절              | 이 계획                 | 후속                 |
| -------------------- | ----------------------- | -------------------- |
| §1 서빙              | Task 1·2·3·4·5          | —                    |
| §2 MediaPipe         | —                       | 계획 2               |
| §3 프레임 파이프라인 | 카메라 해상도(Task 7)만 | 주기·스레드는 계획 2 |
| §4 판정 규칙         | —                       | 계획 2               |
| §5 가속도            | 브리지 통로(Task 6)만   | 신호는 계획 2        |
| §6 study-core        | —                       | 계획 3               |
| §7 저장·전송         | —                       | 계획 3               |
| §8 진단 로그         | —                       | 계획 2               |
| §10 스파이크         | S1(Task 5)·S2(Task 9)   | S3·S4·S5는 계획 2·3  |

**2. Placeholder scan** — Task 5 Step 4의 `<선정한-서버-라이브러리>`와 라이브러리 호출부는 **의도된 미결정**이다. 라이브러리를 지금 고르면 `frontend/CLAUDE.md`의 "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것"을 어기게 되므로, Step 1이 선정 기준 4개를 명시하고 Step 4가 골격과 제약(동적 포트·`127.0.0.1` 바인딩·실패 시 `origin` 불변)을 고정한다.

**3. Type consistency** — 확인한 것: `WebAssetServer`(Task 3 정의 → Task 4·5 사용), `buildSessionUrl`(Task 3 → Task 4), `CameraFlipResult`의 `no-alternative`/`camera-off`(기존 `cameraAdapter.ts` → Task 7), `CameraPreviewSurfaceProps`의 `stream`(Task 8에서 추가 → 같은 태스크에서 `RoomPage` 호출부 갱신), `ToWebMessage`/`ToNativeMessage`(Task 6에서 양쪽 동시 정의).

**4. 기존 코드 회귀** — Task 4는 `focusStartFlow.ts`를 건드리지 않고 주입되는 navigator만 바꾼다. Task 8은 `CameraPreviewSurface`에 필수 prop을 추가하므로 호출부(`RoomPage.tsx` 198행)를 같은 태스크에서 함께 고친다 — 그 외 호출부가 없음을 Step 7의 전체 테스트가 확인한다.
