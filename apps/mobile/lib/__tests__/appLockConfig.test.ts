import fs from "node:fs";
import path from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import buildConfig from "../../app.config";
import appJson from "../../app.json";
import { copy } from "../i18n";

// App Group은 Apple Developer에 환경마다 따로 등록돼 있어 번들 id와 같은 접미사를 따라가야 서명된다.
describe("방해 앱 잠금 config plugin", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it.each([
    [undefined, "group.com.breathlessyouth.mobile.dev"],
    ["staging", "group.com.breathlessyouth.mobile.staging"],
    ["production", "group.com.breathlessyouth.mobile"],
  ])("APP_VARIANT=%s의 App Group은 %s다", (variant, appGroup) => {
    if (variant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = variant;
    const cfg = buildConfig({ config: appJson.expo as unknown as ExpoConfig } as ConfigContext);
    expect(cfg.plugins).toContainEqual([
      "react-native-device-activity",
      { appleTeamId: "9BCSD3ZRDQ", appGroup },
    ]);
  });
});

// 언어 폴더에 빠진 문구는 빌드 오류 없이 기본 values의 영어로 보인다.
describe("방해 앱 잠금 Android 문구", () => {
  const resDir = path.join(__dirname, "../../modules/app-lock/android/src/main/res");

  function resourceNames(folder: string): string[] {
    const xml = fs.readFileSync(path.join(resDir, folder, "strings.xml"), "utf8");
    return [...xml.matchAll(/<(?:string|plurals) name="([^"]+)"/g)].map((m) => m[1]).sort();
  }

  it("모든 values 폴더가 같은 리소스 이름을 가진다", () => {
    const folders = fs.readdirSync(resDir).filter((name) => name.startsWith("values"));
    expect(folders).toEqual(
      expect.arrayContaining(["values", "values-ko", "values-ja", "values-b+zh+Hant"]),
    );
    const base = resourceNames("values");
    for (const folder of folders) {
      expect({ folder, names: resourceNames(folder) }).toEqual({ folder, names: base });
    }
  });

  // 일본어 アプリロック·번체 중국어 鎖定은 앱 비밀번호 잠금으로 읽혀 공부 중 앱을 막는 기능으로 이해되지 않는다.
  it.each([
    ["values-ja", "ja", "ブロック", /(?<!ブ)ロック/],
    ["values-b+zh+Hant", "zh-Hant", "封鎖", /鎖定/],
  ] as const)("%s와 %s 셸 문구는 앱 잠금을 %s로 쓴다", (folder, locale, word, banned) => {
    const xml = fs.readFileSync(path.join(resDir, folder, "strings.xml"), "utf8");
    const shell = Object.entries(copy[locale])
      .filter(([key]) => key.startsWith("appLock"))
      .map(([, text]) => text)
      .join("\n");
    for (const text of [xml, shell]) {
      expect(text).toContain(word);
      expect(text).not.toMatch(banned);
    }
  });
});
