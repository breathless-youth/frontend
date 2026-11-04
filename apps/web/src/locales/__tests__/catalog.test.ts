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
  });
});
