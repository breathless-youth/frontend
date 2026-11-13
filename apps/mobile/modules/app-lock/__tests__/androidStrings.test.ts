import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Android 잠금 서비스 문구는 모듈 리소스에서 OS가 기기 언어로 고른다.
 * 기본 `values`가 영어여야 한국어가 아닌 기기에서 영어가 보인다.
 */
const androidMain = path.join(__dirname, "../android/src/main");
const resource = (dir: string) => path.join(androidMain, "res", dir, "strings.xml");

function resourceNames(dir: string): string[] {
  const xml = readFileSync(resource(dir), "utf-8");
  return [...xml.matchAll(/<(?:string|plurals) name="([^"]+)"/g)].map((m) => m[1]).sort();
}

describe("앱 잠금 Android 문구 리소스", () => {
  it("영어 기본과 한국어 리소스가 있고 이름 집합이 같다", () => {
    expect(existsSync(resource("values"))).toBe(true);
    expect(existsSync(resource("values-ko"))).toBe(true);
    expect(resourceNames("values")).toEqual(resourceNames("values-ko"));
  });

  it("리소스 이름은 앱 리소스와 겹치지 않게 모듈 접두를 붙인다", () => {
    for (const name of resourceNames("values")) {
      expect(name).toMatch(/^app_lock_/);
    }
  });

  it("기본 리소스는 영어이고 한국어 리소스는 한국어다", () => {
    expect(readFileSync(resource("values"), "utf-8")).not.toMatch(/[가-힣]/);
    expect(readFileSync(resource("values-ko"), "utf-8")).toMatch(/[가-힣]/);
  });

  it("잠금 서비스에는 한글 문자열 리터럴이 남지 않는다", () => {
    const kotlin = readFileSync(
      path.join(androidMain, "java/expo/modules/applock/AppLockService.kt"),
      "utf-8",
    );
    const literals = [...kotlin.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]);
    expect(literals.filter((text) => /[가-힣]/.test(text))).toEqual([]);
  });

  // 이 저장소에서는 Kotlin을 컴파일하지 않아서 없는 리소스 이름은 네이티브 빌드에서야 드러난다.
  it("잠금 서비스가 쓰는 drawable 리소스가 모듈에 있다", () => {
    const kotlin = readFileSync(
      path.join(androidMain, "java/expo/modules/applock/AppLockService.kt"),
      "utf-8",
    );
    const used = [...new Set([...kotlin.matchAll(/R\.drawable\.(\w+)/g)].map((m) => m[1]))];
    const available = readdirSync(path.join(androidMain, "res"))
      .filter((dir) => dir.startsWith("drawable"))
      .flatMap((dir) => readdirSync(path.join(androidMain, "res", dir)))
      .map((file) => file.replace(/\.(xml|png)$/, ""));

    expect(used).toContain("app_lock_lakki");
    expect(used.filter((name) => !available.includes(name))).toEqual([]);
  });
});
