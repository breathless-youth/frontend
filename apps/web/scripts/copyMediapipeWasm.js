import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * `@mediapipe/tasks-vision`의 wasm 런타임을 `public/mediapipe/wasm/`으로 복사한다.
 *
 * ## 왜 손으로 복사해 커밋하지 않는가
 *
 * wasm 바이너리는 같은 npm 패키지의 JS 글루(`vision_bundle.mjs`)와 **버전이 정확히 맞아야
 * 한다** — 둘은 한 빌드에서 함께 나온 한 쌍이다. 한 번 손으로 복사해 커밋해 두면, 나중에
 * 패키지 버전이 올라갈 때 **JS만 새 버전이 되고 wasm은 옛 버전으로 남는다.**
 *
 * 그 불일치는 `pnpm install`도 `tsc`도 `vite build`도 전부 통과한다. 드러나는 곳은 런타임뿐이고,
 * 증상은 `Aborted()`나 알 수 없는 wasm 링크 에러라서 **원인이 "wasm이 낡았다"라고 어디에도
 * 안 적힌다.** `syncWebDist.js`가 막으려는 것과 같은 종류의, 조용히 틀리는 실패다.
 *
 * 매 `dev`·`build` 앞에서 패키지로부터 다시 복사하면 둘이 어긋날 수 있는 구간 자체가 없어진다.
 * 그래서 `public/mediapipe/`는 **생성물**이고 `.gitignore`에 들어간다.
 *
 * ## `public/models/`는 왜 반대로 커밋하는가
 *
 * 모델(`efficientdet_lite0_*.tflite`)은 **npm에 없다.** MediaPipe가 GCS에 올려둔 배포본을
 * 받아야 하는데, 그것을 빌드 스텝으로 만들면 (1) 빌드가 네트워크에 의존하게 되고 — 세션이
 * 네트워크 없이 동작해야 한다는 원칙(설계 §1)을 빌드 단계에서 뒤집는다 — (2) 원격 파일이
 * 조용히 갱신돼도 알 수 없다. 반대로 저장소에 커밋해 두면 재생성할 원본이 없으므로 낡을
 * 수가 없고, 파일이 바뀌면 diff에 그대로 보인다. 그래서 모델은 커밋하고 wasm은 생성한다.
 *
 * ## 실행 방식
 *
 * `apps/web`은 `"type": "module"`이라 `.js`가 ESM으로 해석된다. `apps/mobile/scripts/syncWebDist.js`가
 * CommonJS인 것과 갈리는 지점은 여기뿐이고, `node:` prefix·주석 밀도·"실패는 소리내서
 * 실패한다"는 원칙은 그대로 따른다. `require.resolve`만 CommonJS 해석기가 필요해
 * `createRequire`로 만든다 — 패키지의 `exports` 맵이 wasm 파일을 개별 서브패스로 내보내므로,
 * 경로를 문자열로 박지 않고 **패키지가 스스로 선언한 위치**를 물어본다.
 */

const require = createRequire(import.meta.url);

/**
 * 원본 디렉터리를 찾기 위한 기준 파일.
 *
 * `@mediapipe/tasks-vision/package.json`은 `exports`에 없어 resolve할 수 없다. 대신 패키지가
 * 명시적으로 내보내는 wasm 서브패스 하나를 풀고 그 디렉터리를 취한다. 이 서브패스가 사라지면
 * resolve가 던지고, 그 자체가 "패키지 레이아웃이 바뀌었다"는 신호가 된다 — 조용히 빈
 * 디렉터리를 만드는 것보다 낫다.
 */
const ANCHOR_SUBPATH = "@mediapipe/tasks-vision/vision_wasm_internal.wasm";

/**
 * 복사에서 제외하는 변형 — `*_module_internal.*` (ES module 빌드).
 *
 * ## 왜 이것만 제외해도 안전한가
 *
 * 파일 선택은 런타임에 정해지므로 원칙적으로 골라 담으면 안 된다 — 빠진 쪽을 고른 기기에서만
 * 404가 나고, 그 실패는 재현이 어렵다. 그래서 SIMD 여부로는 **절대 고르지 않는다.**
 *
 * 다만 `_module` 변형은 다르다. 번들된 `vision_bundle.mjs`의 선택 로직을 그대로 옮기면
 *
 * ```js
 * forVisionTasks(path, useModule = false)
 *   → `${path}/vision_wasm${useModule ? "_module" : ""}${simd ? "" : "_nosimd"}_internal.wasm`
 * ```
 *
 * 즉 `_module`이 붙는 유일한 조건은 **호출자가 두 번째 인자에 `true`를 넘기는 것**이다.
 * 기기·브라우저·SIMD 지원 여부와 무관하다. `vision/mediapipeModule.ts`는 인자를 하나만
 * 넘기므로 이 두 파일은 어떤 환경에서도 요청되지 않는다 — 11.3 MiB가 순수 사군살이다.
 *
 * SIMD/nosimd 두 쌍(21.9 MiB)은 그대로 담는다. 그쪽이 진짜 런타임 분기다.
 *
 * ⚠️ **`forVisionTasks`에 `useModule = true`를 넘기려면 이 제외를 먼저 풀어야 한다.**
 * 안 풀면 그 기기에서 wasm 404로 감지가 통째로 죽는다. `vision/mediapipeModule.ts`의
 * 호출부에 같은 경고를 걸어 뒀다.
 */
const EXCLUDED_PATTERN = /_module_internal\.(js|wasm)$/;

function listFiles(dir, { applyExclusion = false } = {}) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !applyExclusion || !EXCLUDED_PATTERN.test(name))
    .sort();
}

/** 원본 wasm 디렉터리. 패키지가 없으면 resolve가 던진다. */
export function resolveWasmSourceDir() {
  return path.dirname(require.resolve(ANCHOR_SUBPATH));
}

/**
 * 복사하고, **복사 결과를 다시 읽어 검증한다.**
 *
 * 복사만 하고 끝내면 부분 실패(디스크 가득참, 권한)가 그대로 통과한다. 여기서 실패를
 * 확정해야 호출자가 빌드를 멈출 수 있다.
 */
export function copyMediapipeWasm({ srcDir, destDir }) {
  const srcFiles = listFiles(srcDir, { applyExclusion: true });
  if (srcFiles.length === 0) {
    throw new Error(
      `@mediapipe/tasks-vision의 wasm 디렉터리가 비어 있습니다: ${srcDir}\n` +
        "'pnpm install'로 의존성이 실제로 설치됐는지 확인하세요.",
    );
  }

  fs.mkdirSync(destDir, { recursive: true });

  for (const name of srcFiles) {
    // 크기·시각 비교로 건너뛰지 않는다. 패키지 버전이 올라도 파일 크기가 같을 수 있고,
    // 그때 건너뛰면 이 스크립트가 애초에 막으려던 "wasm만 옛 버전" 상태를 스스로 만든다.
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  }

  // 옛 버전에만 있던 파일이 남으면 번들이 계속 불어나고, 최악의 경우 낡은 wasm이 서빙된다.
  const keep = new Set(srcFiles);
  for (const name of listFiles(destDir)) {
    if (!keep.has(name)) {
      fs.rmSync(path.join(destDir, name));
    }
  }

  const problems = verifyCopy({ srcDir, destDir, srcFiles });
  if (problems.length > 0) {
    throw new Error(
      `wasm 복사가 끝났지만 결과가 원본과 다릅니다: ${destDir}\n` +
        problems.map((line) => `  ${line}`).join("\n"),
    );
  }

  return { destDir, files: srcFiles };
}

/** 복사본이 원본과 같은 파일 집합·같은 크기인지 확인한다. */
function verifyCopy({ srcDir, destDir, srcFiles }) {
  const problems = [];
  const destFiles = new Set(listFiles(destDir));

  for (const name of srcFiles) {
    if (!destFiles.has(name)) {
      problems.push(`누락: ${name}`);
      continue;
    }
    const srcSize = fs.statSync(path.join(srcDir, name)).size;
    const destSize = fs.statSync(path.join(destDir, name)).size;
    if (srcSize !== destSize) {
      problems.push(`크기 불일치: ${name} (${srcSize} → ${destSize})`);
    }
    destFiles.delete(name);
  }

  for (const name of destFiles) {
    problems.push(`원본에 없는 파일이 남음: ${name}`);
  }

  return problems;
}

/**
 * 빌드가 이 자산 없이 진행되지 못하게 하는 최소 표식.
 *
 * `public/mediapipe/`는 `.gitignore` 대상이라 **갓 클론한 저장소에는 존재하지 않는다.**
 * 이 스크립트를 거치지 않고 `vite build`를 직접 부르면 wasm 없는 `dist`가 에러 없이 나오고,
 * 그 앱은 세션을 시작하는 순간에야 404로 죽는다. `vite.config.ts`가 이 파일의 존재를
 * 빌드 시작 시점에 확인해 그 경로를 막는다.
 */
export const WASM_SENTINEL_FILE = "vision_wasm_internal.wasm";

/** `apps/web/public/mediapipe/wasm` — `visionConfig.ts`의 `MEDIAPIPE_WASM_PATH`와 짝이다. */
export const WASM_PUBLIC_DIR = path.resolve(import.meta.dirname, "../public/mediapipe/wasm");

// `vite.config.ts`가 이 모듈을 import해 표식만 확인하므로, import만으로 복사가 돌면 안 된다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const srcDir = resolveWasmSourceDir();
    const { files } = copyMediapipeWasm({ srcDir, destDir: WASM_PUBLIC_DIR });
    console.log(`mediapipe wasm 복사 완료 (${files.length}개) → ${WASM_PUBLIC_DIR}`);
  } catch (error) {
    console.error("mediapipe wasm을 준비하지 못했습니다.");
    console.error(error instanceof Error ? error.message : error);
    // 여기서 멈추지 않으면 wasm 없는 dist가 조용히 만들어진다.
    process.exit(1);
  }
}
