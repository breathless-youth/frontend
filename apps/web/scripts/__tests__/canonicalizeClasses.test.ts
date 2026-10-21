import { describe, expect, it } from "vitest";

import { canonicalizeSource, loadCanonicalizer } from "../canonicalizeClasses.js";

const MAP: Record<string, string> = {
  "h-[52px]": "h-13",
  "sm:h-[52px]": "sm:h-13",
  "before:-top-[7px]": "before:-top-1.75",
  "gap-[3px]": "gap-0.75",
  "w-[60px]": "w-15",
  "size-[46px]": "size-11.5",
};
const fake = (t: string) => MAP[t] ?? t;

describe("canonicalizeSource", () => {
  it("className 문자열의 px 임의값을 스케일 표기로 바꾼다", () => {
    const src = `export const A = () => <div className="flex h-[52px]" />;\n`;
    const out = canonicalizeSource("a.tsx", src, fake);
    expect(out.text).toBe(`export const A = () => <div className="flex h-13" />;\n`);
    expect(out.changes).toEqual([{ line: 1, from: "h-[52px]", to: "h-13" }]);
  });

  it("변형이 붙은 클래스와 cn() 인자·이름에 class가 든 상수도 바꾼다", () => {
    const src = `const ROW_CLASS = "p-2 sm:h-[52px]";\ncn("before:-top-[7px] text-sm");\n`;
    const out = canonicalizeSource("a.ts", src, fake);
    expect(out.text).toBe(`const ROW_CLASS = "p-2 sm:h-13";\ncn("before:-top-1.75 text-sm");\n`);
    expect(out.changes.map((c) => c.line)).toEqual([1, 2]);
  });

  it("classNames 객체 프로퍼티와 toHaveClass 인자를 바꾼다", () => {
    const src = `f({ classNames: { row: "h-[52px]" } });\nexpect(el).toHaveClass("gap-[3px]");\n`;
    const out = canonicalizeSource("a.ts", src, fake);
    expect(out.text).toBe(
      `f({ classNames: { row: "h-13" } });\nexpect(el).toHaveClass("gap-0.75");\n`,
    );
  });

  it("대문자 상수와 className을 단언하는 매처 인자를 바꾼다", () => {
    const src = [
      `const SIZE = { md: "size-[46px]" };`,
      `expect(el.className).toContain("h-[52px]");`,
      `expect(classes).not.toContain("gap-[3px]");`,
      `const size = "w-[60px]";`,
      `expect(el.textContent).toContain("w-[60px]");`,
      "",
    ].join("\n");
    const out = canonicalizeSource("a.ts", src, fake);
    expect(out.changes.map((c) => `${c.line}:${c.to}`)).toEqual([
      "1:size-11.5",
      "2:h-13",
      "3:gap-0.75",
    ]);
  });

  it("클래스 문맥이 아닌 문자열은 클래스처럼 생겨도 그대로 둔다", () => {
    const src = [
      `const A = () => <div aria-label="h-[52px]" data-testid="gap-[3px]" />;`,
      `const message = "h-[52px]";`,
      `expect(screen.getByText("h-[52px]")).toHaveClass("flex");`,
      `const B = () => <div className={cn("flex")} title={cn("w-[60px]") && "h-[52px]"} />;`,
      "",
    ].join("\n");
    const out = canonicalizeSource("a.tsx", src, fake);
    expect(out.text).toBe(src.replace(`cn("w-[60px]")`, `cn("w-15")`));
  });

  it("클래스 문맥 안이라도 다른 함수의 인자로 들어간 문자열은 그대로 둔다", () => {
    const src = `cn(formatMessage("gap-[3px]"), "gap-[3px]");\nconst ROW_CLASS = t("h-[52px]");\n`;
    const out = canonicalizeSource("a.ts", src, fake);
    expect(out.text).toBe(
      `cn(formatMessage("gap-[3px]"), "gap-0.75");\nconst ROW_CLASS = t("h-[52px]");\n`,
    );
  });

  it("템플릿 문자열에서 ${} 앞뒤에 붙은 토큰은 건드리지 않는다", () => {
    const src =
      "const A = () => <div className={`h-[52px] ${x}gap-[3px] w-[60px] gap-[3px]${y} gap-[3px]`} />;\n";
    const out = canonicalizeSource("a.tsx", src, fake);
    expect(out.text).toBe(
      "const A = () => <div className={`h-13 ${x}gap-[3px] w-15 gap-[3px]${y} gap-0.75`} />;\n",
    );
  });

  it("템플릿 안에 중첩된 템플릿의 클래스도 바꾼다", () => {
    const src = 'const A = () => <div className={`${cond ? `h-[52px]` : ""} w-[60px]`} />;\n';
    const out = canonicalizeSource("a.tsx", src, fake);
    expect(out.text).toBe('const A = () => <div className={`${cond ? `h-13` : ""} w-15`} />;\n');
  });

  it("바꿀 것이 없으면 원문 그대로 돌려준다", () => {
    const src = `import x from "./h-[52px]";\nconst s = "flex";\n`;
    const out = canonicalizeSource("a.ts", src, fake);
    expect(out.text).toBe(src);
    expect(out.changes).toEqual([]);
  });

  it("canonicalize가 던지면 오류를 그대로 올린다", () => {
    const boom = () => {
      throw new Error("tailwind 내부 오류");
    };
    expect(() => canonicalizeSource("a.ts", `cn("h-[52px]");\n`, boom)).toThrow(
      "tailwind 내부 오류",
    );
  });

  it("canonicalize가 문자열이 아닌 값을 돌려주면 던진다", () => {
    const broken = () => undefined as unknown as string;
    expect(() => canonicalizeSource("a.ts", `cn("h-[52px]");\n`, broken)).toThrow();
  });
});

describe("loadCanonicalizer", () => {
  it("IntelliSense와 같은 표준 표기를 돌려주고 클래스가 아닌 문자열은 그대로 둔다", async () => {
    const canonicalize = await loadCanonicalizer();
    expect(canonicalize("h-[52px]")).toBe("h-13");
    expect(canonicalize("rounded-[20px]")).toBe("rounded-xl");
    expect(canonicalize("bg-[var(--session-dim)]")).toBe("bg-(--session-dim)");
    expect(canonicalize("h-[1px]")).toBe("h-px");
    expect(canonicalize("pb-[calc(env(safe-area-inset-bottom)+24px)]")).toBe(
      "pb-[calc(env(safe-area-inset-bottom)+24px)]",
    );
    expect(canonicalize("안녕하세요")).toBe("안녕하세요");
  });
});
