import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `vercel.json` 응답 헤더 가드.
 *
 * 웹뷰 도메인은 앱 안에서만 열리는 화면이라 검색 결과에 잡히면 안 되는데, 그걸 막는 수단이
 * 설정 파일의 헤더 한 줄뿐이다. 이 헤더가 지워지거나 대상 경로가 좁아져도 앱은 멀쩡히 돌고
 * 빌드도 통과한다 — 몇 주 뒤 검색 결과를 보고서야 알게 된다. 그래서 못 박는다.
 *
 * JSON을 `import`하지 않고 파일로 읽는 이유는 `vercel.json`이 `src` 밖에 있어서다.
 *
 * 경로를 `import.meta.url`로 잡으면 안 된다. Vite가 `new URL(..., import.meta.url)`을 애셋
 * 참조로 해석해 `http:` URL로 바꿔버려서 `readFileSync`가 스킴 오류로 죽는다.
 */
type HeaderRule = {
  source: string;
  headers: { key: string; value: string }[];
};

const rules = (
  JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8")) as {
    headers: HeaderRule[];
  }
).headers;

/** 어떤 경로도 제외하지 않는 패턴. 제외가 붙으면 그 경로만 색인이 열린 채 남는다. */
const ALL_PATHS = "/(.*)";

describe("vercel.json 응답 헤더", () => {
  it("모든 경로에 색인 차단 헤더가 걸린다", () => {
    const applied = rules
      .filter((rule) => rule.source === ALL_PATHS)
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === "X-Robots-Tag")
      .map((header) => header.value);

    expect(applied).toHaveLength(1);

    // 부분 일치로 보면 `noindexing` 같은 오타도 통과한다. 지시자 목록으로 갈라서 판정한다.
    const directives = applied[0].split(",").map((directive) => directive.trim());

    expect(directives).toContain("noindex");
  });

  it("교차 출처 격리 헤더가 유지된다", () => {
    const keys = rules.flatMap((rule) => rule.headers).map((header) => header.key);

    expect(keys).toContain("Cross-Origin-Opener-Policy");
    expect(keys).toContain("Cross-Origin-Embedder-Policy");
  });

  // Vercel 기본값은 해시된 파일도 max-age=0으로 내보내, 앱을 켤 때마다 폰트·JS·CSS를 서버에
  // 다시 확인한다. 파일명에 해시가 있어 내용이 바뀌면 이름도 바뀌므로 오래 캐시해도 안전하다.
  it("해시된 /assets 파일은 1년 immutable 캐시로 나간다", () => {
    const applied = rules
      .filter((rule) => rule.source === "/assets/(.*)")
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === "Cache-Control")
      .map((header) => header.value);

    expect(applied).toEqual(["public, max-age=31536000, immutable"]);
  });

  // index.html까지 immutable로 잡히면 배포해도 앱이 옛 화면과 옛 자산 목록을 계속 쓴다.
  it("immutable 캐시는 /assets 밖으로 번지지 않는다", () => {
    const immutableSources = rules
      .filter((rule) =>
        rule.headers.some(
          (header) => header.key === "Cache-Control" && header.value.includes("immutable"),
        ),
      )
      .map((rule) => rule.source);

    expect(immutableSources).toEqual(["/assets/(.*)"]);
  });
});
