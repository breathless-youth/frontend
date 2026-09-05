import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * App Link 검증 파일 가드.
 *
 * 이 두 파일이 틀려도 웹은 멀쩡히 뜨고 빌드도 통과한다. 실패는 기기에서 링크가 브라우저로
 * 열리는 형태로만 드러나고, iOS는 검증 결과를 캐시해 되돌리는 데 재설치가 필요하다.
 * 그래서 앱 아이덴티티 목록과 지문 형식을 여기서 못 박는다.
 *
 * 경로를 `import.meta.url`로 잡으면 Vite가 애셋 참조로 해석해 `readFileSync`가 죽는다.
 */
const WELL_KNOWN = path.resolve(__dirname, "../../../public/.well-known");
const read = (name: string) =>
  JSON.parse(readFileSync(path.join(WELL_KNOWN, name), "utf8")) as unknown;

describe("well-known 앱 연결 파일", () => {
  it("AASA는 운영과 staging appID를 같은 경로로 허가한다", () => {
    const aasa = read("apple-app-site-association") as {
      applinks: { details: { appIDs: string[]; components: { "/": string }[] }[] };
    };
    const detail = aasa.applinks.details[0];
    expect(detail.appIDs).toEqual([
      "9BCSD3ZRDQ.com.breathlessyouth.mobile",
      "9BCSD3ZRDQ.com.breathlessyouth.mobile.staging",
    ]);
    expect(detail.components.map((c) => c["/"])).toEqual(["/social/join"]);
  });

  it("assetlinks는 운영 패키지 항목을 그대로 두고 development 패키지는 넣지 않는다", () => {
    const links = read("assetlinks.json") as {
      target: { package_name: string; sha256_cert_fingerprints: string[] };
    }[];
    const names = links.map((l) => l.target.package_name);
    expect(names).toContain("com.breathlessyouth.mobile");
    expect(names).toContain("com.breathlessyouth.mobile.staging");
    expect(names).not.toContain("com.breathlessyouth.mobile.dev");
    for (const l of links) {
      expect(l.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
      for (const fp of l.target.sha256_cert_fingerprints) {
        expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      }
    }
  });
});
