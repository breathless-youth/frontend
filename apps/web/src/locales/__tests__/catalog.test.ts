import { describe, expect, it } from "vitest";

import { buildResources } from "@/lib/i18n";
import { SUPPORTED_LOCALES } from "@/lib/locale";

/**
 * 지원 언어 카탈로그 짝 검사
 *
 * 키가 한쪽에만 있으면 운영에서 키 문자열이 그대로 화면에 나온다.
 * 복수형 키는 접미를 떼고 한국어 기본 키와 맞춘다.
 * 필요한 복수 범주는 언어마다 달라서 Intl.PluralRules에서 읽는다.
 */
const resources = buildResources(
  import.meta.glob<{ default: Record<string, unknown> }>("../*/*.json", { eager: true }),
);

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") {
    out.set(prefix, node);
    return out;
  }
  for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
    for (const [k, v] of flatten(child, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
  }
  return out;
}

function variables(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]).sort();
}

function byBaseKey(flat: Map<string, string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [key, value] of flat) {
    const base = key.replace(PLURAL_SUFFIX, "");
    const vars = out.get(base) ?? new Set<string>();
    for (const v of variables(value)) if (v !== "count") vars.add(v);
    out.set(base, vars);
  }
  return out;
}

/**
 * 화면마다 이름이 달랐던 기능을 스토어 표기 하나로 맞췄다(BY-1212).
 * 마스코트는 캐릭터로 부르기로 했다(BY-1238).
 * 번역을 고칠 때 예전 표기가 다시 들어오지 않게 막는다.
 */
const RETIRED_TERMS: Partial<Record<string, RegExp[]>> = {
  en: [/timelapse/i, /\bapp lock/i, /mascot/i],
  ja: [/(?<!ブ)ロック/, /マスコット/],
  // 대만 번체는 한자와 라틴 문자 사이를 띄운다(App 封鎖, 在 App 中).
  "zh-Hant": [
    /應用程式/,
    /計畫表/,
    /鎖定/,
    /編輯記錄/,
    /新記錄/,
    /\p{Script=Han}App|App\p{Script=Han}/u,
    /吉祥物/,
  ],
};

const namespaces = Object.keys(resources.ko ?? {});
const translated = SUPPORTED_LOCALES.filter((lng) => lng !== "ko");

describe.each(translated)("%s 카탈로그", (lng) => {
  it("ko와 네임스페이스가 같다", () => {
    expect(Object.keys(resources[lng] ?? {}).sort()).toEqual([...namespaces].sort());
  });

  describe.each(namespaces)("%s", (ns) => {
    const ko = flatten(resources.ko[ns]);
    const translation = flatten(resources[lng]?.[ns] ?? {});

    it("키 집합이 같다", () => {
      expect([...byBaseKey(translation).keys()].sort()).toEqual([...byBaseKey(ko).keys()].sort());
    });

    it("복수형 키는 그 언어의 복수 범주를 모두 갖는다", () => {
      const categories = new Intl.PluralRules(lng).resolvedOptions().pluralCategories;
      for (const key of translation.keys()) {
        const base = key.replace(PLURAL_SUFFIX, "");
        if (base === key) continue;
        for (const category of categories) {
          expect(translation.has(`${base}_${category}`), `${base}_${category}`).toBe(true);
        }
      }
    });

    it("빈 값이 없다", () => {
      for (const [key, value] of [...ko, ...translation]) expect(value.trim(), key).not.toBe("");
    });

    it("보간 변수 이름이 같다", () => {
      const koVars = byBaseKey(ko);
      for (const [key, vars] of byBaseKey(translation)) {
        expect([...vars].sort(), key).toEqual([...(koVars.get(key) ?? [])].sort());
      }
    });

    it("통일하기로 한 용어의 다른 표기가 없다", () => {
      for (const [key, value] of translation) {
        for (const term of RETIRED_TERMS[lng] ?? []) expect(value, key).not.toMatch(term);
      }
    });
  });
});

/**
 * 관리·자율 모드 공식 명칭
 *
 * 모드 이름이 홈 전환 안내와 기록 탭 하루 요약에서 같아야 사용자가 같은 모드로 알아본다.
 * 기록 행 배지만 자리가 좁아 영어를 줄여 쓴다.
 */
const MODE_NAMES: Record<string, [camera: string, timer: string]> = {
  ko: ["관리 모드", "자율 모드"],
  en: ["Camera Mode", "Self-guided Mode"],
  ja: ["カメラモード", "自主モード"],
  "zh-Hant": ["相機模式", "自主模式"],
};

describe.each(Object.keys(MODE_NAMES))("%s 모드 이름", (lng) => {
  const [camera, timer] = MODE_NAMES[lng]!;
  const home = flatten(resources[lng]?.home);
  const records = flatten(resources[lng]?.records);

  it("홈 전환 안내와 기록 탭 하루 요약이 공식 명칭을 쓴다", () => {
    expect(home.get("v3.measureMode.toast.camera")).toContain(camera);
    expect(home.get("v3.measureMode.toggle.camera")).toContain(camera);
    expect(home.get("v3.measureMode.toast.timer")).toContain(timer);
    expect(home.get("v3.measureMode.toggle.timer")).toContain(timer);
    expect(records.get("headline.modeSplit")).toContain(camera);
    expect(records.get("headline.modeSplit")).toContain(timer);
  });

  it("온보딩 1단계 안내가 자율 모드 공식 명칭을 쓴다", () => {
    expect(flatten(resources[lng]?.onboarding).get("autoTimer.hint")).toContain(timer);
  });
});

/**
 * 공부 시작 버튼 이름
 *
 * 자율 모드 세션도 같은 버튼으로 시작하므로 집중·순공이 아니라 공부로 부른다.
 */
it.each(SUPPORTED_LOCALES)("%s 홈·옛 홈·랭킹의 시작 버튼 이름이 같다", (lng) => {
  const home = flatten(resources[lng]?.home);
  const label = home.get("v3.startStudy");
  expect(home.get("startFocus")).toBe(label);
  expect(flatten(resources[lng]?.ranking).get("focusStart.label")).toBe(label);
});

it("영어 기록 행 배지는 줄인 이름을 쓴다", () => {
  expect(flatten(resources.en?.records).get("timerItem.badge")).toBe("Self-guided");
});
