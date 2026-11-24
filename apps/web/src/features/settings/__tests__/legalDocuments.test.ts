import { describe, expect, it } from "vitest";

import {
  effectiveDateLabel,
  type LegalDocument,
  type LegalEdit,
  PRIVACY_POLICY,
  PRIVACY_POLICY_20261224,
  PRIVACY_POLICY_20261224_EDITS,
  reviseLegalDocument,
  selectLegalEdition,
  TERMS_OF_SERVICE,
  TERMS_OF_SERVICE_20261224,
  TERMS_OF_SERVICE_20261224_EDITS,
} from "../legalDocuments";

/**
 * 웹 원본(`/terms`·`/privacy`)의 사본이 구조적으로 성립하는지 지킨다.
 *
 * 본문 문구를 여기에 다시 적어 비교하지 않는다 — 사본의 사본이 되어 원본이 바뀌면 두 곳을 고쳐야
 * 한다. 대신 **렌더러가 의존하는 불변식**(빈 블록 없음, 키로 쓰는 값의 유일성)을 검증한다.
 * 개정 전 판이 바뀌지 않았는지 확인하는 개정 대상 문단 하나만 예외로 글자를 적는다.
 */

const DOCUMENTS: [string, LegalDocument][] = [
  ["이용약관", TERMS_OF_SERVICE],
  ["개인정보처리방침", PRIVACY_POLICY],
  ["2026년 12월 24일 이용약관", TERMS_OF_SERVICE_20261224],
  ["2026년 12월 24일 개인정보처리방침", PRIVACY_POLICY_20261224],
];

function documentTexts(document: LegalDocument): string[] {
  return [
    document.intro ?? "",
    ...document.sections.flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => {
        switch (block.kind) {
          case "paragraph":
            return [block.text];
          case "bullets":
            return block.items;
          case "fields":
            return block.rows.flatMap((row) => [row.label, row.value]);
        }
      }),
    ]),
  ];
}

describe.each(DOCUMENTS)("%s", (_name, document) => {
  it("제목과 시행일이 비어 있지 않다", () => {
    expect(document.title.length).toBeGreaterThan(0);
    // 시행일은 사본이 낡았는지 판별하는 기준이라 형식이 무너지면 안 된다.
    expect(document.effectiveDate).toMatch(/^\d{4}년 \d{1,2}월 \d{1,2}일$/);
  });

  it("조항이 하나 이상 있고, 모든 조항이 내용을 갖는다", () => {
    expect(document.sections.length).toBeGreaterThan(0);

    for (const section of document.sections) {
      expect(section.heading.trim()).toBe(section.heading);
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.blocks.length).toBeGreaterThan(0);
    }
  });

  it("빈 문단·빈 목록·빈 라벨이 없다", () => {
    for (const section of document.sections) {
      for (const block of section.blocks) {
        switch (block.kind) {
          case "paragraph":
            expect(block.text.length).toBeGreaterThan(0);
            break;
          case "bullets":
            expect(block.items.length).toBeGreaterThan(0);
            for (const item of block.items) {
              expect(item.length).toBeGreaterThan(0);
            }
            break;
          case "fields":
            expect(block.rows.length).toBeGreaterThan(0);
            for (const row of block.rows) {
              expect(row.label.length).toBeGreaterThan(0);
              expect(row.value.length).toBeGreaterThan(0);
            }
            break;
        }
      }
    }
  });

  /**
   * `LegalDocumentScreen`이 조항 제목·목록 항목·필드 라벨을 그대로 React 키로 쓴다.
   * 중복이 생기면 키가 충돌해 렌더가 깨지므로 데이터 쪽에서 막는다.
   */
  it("키로 쓰이는 값(조항 제목·목록 항목·필드 라벨)이 유일하다", () => {
    const headings = document.sections.map((section) => section.heading);
    expect(new Set(headings).size).toBe(headings.length);

    for (const section of document.sections) {
      for (const block of section.blocks) {
        if (block.kind === "bullets") {
          expect(new Set(block.items).size).toBe(block.items.length);
        }
        if (block.kind === "fields") {
          const labels = block.rows.map((row) => row.label);
          expect(new Set(labels).size).toBe(labels.length);
        }
      }
    }
  });

  it("본문에 마크다운 잔재가 섞여 있지 않다 (원문을 평문으로 옮긴다)", () => {
    const texts = document.sections.flatMap((section) =>
      section.blocks.flatMap((block) => {
        switch (block.kind) {
          case "paragraph":
            return [block.text];
          case "bullets":
            return block.items;
          case "fields":
            return block.rows.flatMap((row) => [row.label, row.value]);
        }
      }),
    );

    for (const text of texts) {
      // 링크·강조 문법이 그대로 남으면 화면에 기호가 노출된다.
      expect(text).not.toMatch(/\[.+\]\(.+\)/);
      expect(text).not.toMatch(/\*\*/);
    }
  });
});

describe("문서 구성", () => {
  it("이용약관은 제1조부터 제20조까지 번호가 이어진다", () => {
    const numbers = TERMS_OF_SERVICE.sections.map((section) => {
      const matched = /^제(\d+)조 /.exec(section.heading);
      expect(matched).not.toBeNull();
      return Number((matched as RegExpExecArray)[1]);
    });

    expect(numbers).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it("개인정보처리방침은 1.부터 15.까지 번호가 이어진다", () => {
    const numbers = PRIVACY_POLICY.sections.map((section) => {
      const matched = /^(\d+)\. /.exec(section.heading);
      expect(matched).not.toBeNull();
      return Number((matched as RegExpExecArray)[1]);
    });

    expect(numbers).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
  });

  it("도입 문단은 개인정보처리방침에만 있다", () => {
    expect(PRIVACY_POLICY.intro).toBeDefined();
    expect(TERMS_OF_SERVICE.intro).toBeUndefined();
  });
});

describe("effectiveDateLabel", () => {
  it("시행일 문구를 한 곳에서 만든다", () => {
    expect(effectiveDateLabel(TERMS_OF_SERVICE)).toBe(`시행일: ${TERMS_OF_SERVICE.effectiveDate}`);
    expect(effectiveDateLabel(PRIVACY_POLICY)).toBe(`시행일: ${PRIVACY_POLICY.effectiveDate}`);
  });
});

describe("reviseLegalDocument", () => {
  it("바뀌기 전 글자가 조항에 없으면 throw한다", () => {
    expect(() =>
      reviseLegalDocument(TERMS_OF_SERVICE, "2026년 12월 24일", [
        { section: "제12조 (보상형 광고)", before: "약관에 없는 문장입니다.", after: "새 문장" },
      ]),
    ).toThrow(/제12조 \(보상형 광고\)/);
  });
});

describe("2026년 12월 24일 판", () => {
  const REVISIONS: [string, LegalDocument, readonly LegalEdit[]][] = [
    ["이용약관", TERMS_OF_SERVICE_20261224, TERMS_OF_SERVICE_20261224_EDITS],
    ["개인정보처리방침", PRIVACY_POLICY_20261224, PRIVACY_POLICY_20261224_EDITS],
  ];

  it("약관 제12조 제목이 광고로 바뀐다", () => {
    expect(TERMS_OF_SERVICE_20261224.sections[11].heading).toBe("제12조 (광고)");
  });

  it("약관과 방침 어디에도 배너 광고를 게재하지 않는다는 옛 문장이 남지 않는다", () => {
    for (const document of [TERMS_OF_SERVICE_20261224, PRIVACY_POLICY_20261224]) {
      for (const text of documentTexts(document)) {
        expect(text).not.toContain("배너 광고나 화면을 가리는 전면 광고는 게재하지");
      }
    }
  });

  it.each(REVISIONS)("%s에 바뀐 글자가 모두 들어 있다", (_name, document, edits) => {
    const texts = documentTexts(document);
    for (const edit of edits) {
      expect(texts).toContain(edit.after);
    }
  });
});

describe("2026년 11월 23일 판", () => {
  it("약관 제12조 첫 문단이 개정 전 글자 그대로다", () => {
    const section = TERMS_OF_SERVICE.sections[11];
    expect(section.heading).toBe("제12조 (보상형 광고)");
    expect(section.blocks[0]).toEqual({
      kind: "paragraph",
      text: "서비스는 회원이 포인트를 받으려고 직접 광고 보기를 선택한 경우에만 광고를 보여 줍니다. 배너 광고나 화면을 가리는 전면 광고는 게재하지 않으며, 공부를 측정하는 화면에는 광고를 표시하지 않습니다.",
    });
  });
});

describe("selectLegalEdition", () => {
  const BEFORE = new Date("2026-12-23T23:59:59.999+09:00");
  const AT = new Date("2026-12-24T00:00:00+09:00");

  it.each([
    ["terms", TERMS_OF_SERVICE, TERMS_OF_SERVICE_20261224],
    ["privacy", PRIVACY_POLICY, PRIVACY_POLICY_20261224],
  ] as const)("%s는 한국 시간 12월 24일 0시부터 새 판을 고른다", (kind, current, revised) => {
    expect(selectLegalEdition(kind, BEFORE).document).toBe(current);
    expect(selectLegalEdition(kind, AT).document).toBe(revised);
  });

  it("시행 전에는 11월 23일 판과 다음 판을, 시행 후에는 12월 24일 판만 준다", () => {
    const before = selectLegalEdition("terms", BEFORE);
    expect(before.document.effectiveDate).toBe("2026년 11월 23일");
    expect(before.upcoming).toBe(TERMS_OF_SERVICE_20261224);

    const after = selectLegalEdition("terms", AT);
    expect(after.document.effectiveDate).toBe("2026년 12월 24일");
    expect(after.upcoming).toBeNull();
  });
});
