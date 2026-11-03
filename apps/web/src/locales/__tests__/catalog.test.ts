import { describe, expect, it } from "vitest";

import { buildResources } from "@/lib/i18n";

/**
 * ko·en 카탈로그 짝 검사
 *
 * 키가 한쪽에만 있으면 운영에서 키 문자열이 그대로 화면에 나온다.
 * 영어 복수형 키는 접미를 떼고 한국어 기본 키와 맞춘다.
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

describe("카탈로그", () => {
  it("ko와 en의 네임스페이스가 같다", () => {
    expect(Object.keys(resources.en ?? {}).sort()).toEqual([...namespaces].sort());
  });

  describe.each(namespaces)("%s", (ns) => {
    const ko = flatten(resources.ko[ns]);
    const en = flatten(resources.en?.[ns] ?? {});

    it("키 집합이 같다", () => {
      expect([...byBaseKey(en).keys()].sort()).toEqual([...byBaseKey(ko).keys()].sort());
    });

    it("영어 복수형 키는 _one과 _other가 짝으로 있다", () => {
      for (const key of en.keys()) {
        const base = key.replace(PLURAL_SUFFIX, "");
        if (base === key) continue;
        expect(en.has(`${base}_one`), `${base}_one`).toBe(true);
        expect(en.has(`${base}_other`), `${base}_other`).toBe(true);
      }
    });

    it("빈 값이 없다", () => {
      for (const [key, value] of [...ko, ...en]) expect(value.trim(), key).not.toBe("");
    });

    it("보간 변수 이름이 같다", () => {
      const koVars = byBaseKey(ko);
      for (const [key, vars] of byBaseKey(en)) {
        expect([...vars].sort(), key).toEqual([...(koVars.get(key) ?? [])].sort());
      }
    });
  });
});
