/**
 * 릴리즈 PR(base `main`)의 버전 검사.
 *
 * 웹은 반드시 올라야 하고 앱은 내려가지만 않으면 된다. 앱을 제출하지 않는 주가 있기 때문이다.
 * base 값이 아직 CalVer가 아니어도 숫자 세그먼트 비교라 첫 전환 PR이 통과한다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CALVER, compareVersions } from "./bump-version.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const CHECKS = [
  { file: "apps/web/package.json", get: (j) => j.version, mustIncrease: true },
  { file: "apps/mobile/app.json", get: (j) => j.expo.version, mustIncrease: false },
];

/**
 * head/base 버전 한 쌍을 비교한 판정만 돌려주는 순수 함수. CLI 출력과 분리해 단위 테스트가
 * git이나 파일시스템 없이 이 판정 로직만 검증할 수 있다.
 */
export function evaluate(head, baseValue, mustIncrease) {
  if (!CALVER.test(head)) {
    return { ok: false, reason: `${head}은(는) YY.WW.P 형식이 아닙니다` };
  }
  const cmp = compareVersions(head, baseValue);
  if (cmp < 0 || (mustIncrease && cmp === 0)) {
    return {
      ok: false,
      reason: `${head}이(가) 기준 ${baseValue}보다 ${mustIncrease ? "커야" : "작지 않아야"} 합니다`,
    };
  }
  return { ok: true };
}

// 테스트가 이 모듈을 import해도 CLI가 돌지 않도록 직접 실행일 때만 부른다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseIdx = process.argv.indexOf("--base");
  const base = baseIdx === -1 ? null : process.argv[baseIdx + 1];
  if (!base) {
    console.error("사용법: node scripts/check-version.mjs --base <git ref>");
    process.exit(1);
  }

  let failed = false;
  for (const { file, get, mustIncrease } of CHECKS) {
    let head;
    let baseValue;
    try {
      head = get(JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")));
      baseValue = get(
        JSON.parse(
          execFileSync("git", ["show", `${base}:${file}`], { cwd: ROOT, encoding: "utf8" }),
        ),
      );
    } catch (err) {
      console.error(`${file}: 버전을 읽지 못했습니다 - ${err.message.split("\n")[0]}`);
      failed = true;
      continue;
    }
    const result = evaluate(head, baseValue, mustIncrease);
    if (!result.ok) {
      console.error(`${file}: ${result.reason}`);
      failed = true;
    } else {
      console.log(`${file}: ${baseValue} → ${head} OK`);
    }
  }
  process.exit(failed ? 1 : 0);
}
