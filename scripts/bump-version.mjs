/**
 * 앱·웹 버전을 `YY.WW.P` CalVer로 올린다.
 *
 * 주차는 ISO 8601을 따른다. 월요일에 주가 시작하고 연도도 ISO 주 기준이라, 12월 말 며칠이
 * 다음 해 1주가 아니라 그해 53주에 들어간다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 저장소 루트. 이 파일은 `<root>/scripts/`에 있다. */
const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * `WW`·`P`에 0을 채우지 않는다. iOS는 버전 문자열을 정수 세그먼트로 비교해서
 * 앞자리 0이 안전하지 않다. 주차는 1-53만 허용한다.
 */
export const CALVER = /^(\d{2})\.([1-9]|[1-4]\d|5[0-3])\.(0|[1-9]\d*)$/;

/** 로컬 날짜 기준 ISO 주차. 연·월·일 세 값만 UTC로 다시 만들어 타임존 차이를 없앤다. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const ww = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return { yy: d.getUTCFullYear() % 100, ww };
}

export function parseCalver(version) {
  const m = CALVER.exec(version);
  return m ? { yy: Number(m[1]), ww: Number(m[2]), p: Number(m[3]) } : null;
}

/**
 * 같은 주차면 `P + 1`, 아니면 `YY.WW.0`.
 * `0.0.0`·`1.0.2` 같은 비CalVer 값은 파싱에 실패해 자연히 "다른 주차"로 취급되므로
 * 첫 전환을 위한 분기가 따로 필요 없다.
 */
export function nextVersion(current, date) {
  const { yy, ww } = isoWeek(date);
  const cur = parseCalver(current);
  const p = cur && cur.yy === yy && cur.ww === ww ? cur.p + 1 : 0;
  return `${yy}.${ww}.${p}`;
}

/** 숫자 세그먼트 비교. 모자라는 세그먼트는 0으로 친다. */
export function compareVersions(a, b) {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = Number(left[i] ?? 0);
    const r = Number(right[i] ?? 0);
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

const TARGETS = {
  "--web": { file: "apps/web/package.json", get: (json) => json.version },
  "--app": { file: "apps/mobile/app.json", get: (json) => json.expo.version },
};

const USAGE = "사용법: node scripts/bump-version.mjs [--web] [--app]";

/**
 * JSON을 파싱해 다시 쓰지 않고 `"version"` 줄만 문자열로 바꾼다. `JSON.stringify`는 짧은 배열도
 * 여러 줄로 펼쳐 `app.json`의 `permissions` 같은 곳까지 형식이 바뀐다. 두 파일 모두 `"version"`
 * 키가 하나뿐이지만, 바꾼 뒤 파싱해 의도한 키가 바뀌었는지 확인하고 아니면 되돌린다.
 */
export function bumpFile(fullPath, get, date) {
  const text = fs.readFileSync(fullPath, "utf8");
  const match = /"version": "([^"]+)"/.exec(text);
  if (!match) {
    throw new Error(`${fullPath}: "version" 키를 찾지 못했습니다`);
  }
  const before = match[1];
  const after = nextVersion(before, date);
  const next = text.replace(match[0], `"version": "${after}"`);
  if (get(JSON.parse(next)) !== after) {
    throw new Error(`${fullPath}: 첫 "version" 키가 버전 원천이 아닙니다. 파일을 확인하세요`);
  }
  fs.writeFileSync(fullPath, next);
  return { before, after };
}

export function resolveTargets(flags) {
  if (flags.length === 0) throw new Error(`대상이 없습니다\n${USAGE}`);
  return flags.map((flag) => {
    const target = TARGETS[flag];
    if (!target) {
      throw new Error(`모르는 인자: ${flag}\n${USAGE}`);
    }
    return target;
  });
}

function bump(flags, date) {
  let targets;
  try {
    targets = resolveTargets(flags);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  for (const { file, get } of targets) {
    const { before, after } = bumpFile(path.join(ROOT, file), get, date);
    console.log(`${file}: ${before} → ${after}`);
  }
}

// 테스트가 이 모듈을 import해도 CLI가 돌지 않도록 직접 실행일 때만 부른다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bump(process.argv.slice(2), new Date());
}
