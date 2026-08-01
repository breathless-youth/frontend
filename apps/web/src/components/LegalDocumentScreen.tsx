import {
  effectiveDateLabel,
  type LegalBlock,
  type LegalDocument,
} from "@/features/settings/legalDocuments";

import { ScreenBackHeader } from "./ScreenBackHeader";

/**
 * 법적 문서(이용약관 · 개인정보처리방침) 본문 화면.
 *
 * RN 원본(`apps/mobile/components/LegalDocumentScreen.tsx`)의 웹 이식. 두 문서의 구조가 같아서
 * 렌더러를 하나만 둔다 — 라우트(`TermsPage`·`PrivacyPage`)는 어떤 문서를 넘길지만 정한다. 본문은
 * `features/settings/legalDocuments.ts`가 소유하며 이 컴포넌트는 문구를 알지 못한다.
 */

/** 블록 사이 간격. 문단은 촘촘하게, 조항 안의 목록·라벨 블록은 조금 띄운다. */
function BlockView({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className="mt-[10px] text-[14px] leading-[22px] text-muted-foreground">{block.text}</p>
      );

    case "bullets":
      return (
        <ul className="mt-[10px] flex flex-col gap-[6px]">
          {block.items.map((item) => (
            // 가운뎃점을 텍스트에 섞지 않고 별도 열로 둔다 — 두 줄 이상이 될 때 들여쓰기가 유지된다.
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-[14px] leading-[22px] text-text-tertiary">
                ·
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-[22px] text-muted-foreground">
                {item}
              </span>
            </li>
          ))}
        </ul>
      );

    case "fields":
      return (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-muted p-[14px]">
          {block.rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-[3px]">
              <p className="text-[13px] leading-[16px] font-medium text-foreground">{row.label}</p>
              <p className="text-[14px] leading-[22px] text-muted-foreground">{row.value}</p>
            </div>
          ))}
        </div>
      );
  }
}

export function LegalDocumentScreen({ document }: { document: LegalDocument }) {
  return (
    <div className="min-h-dvh bg-background">
      {/* 제목은 본문 첫 줄이 크게 그린다 — 상단 바에 또 넣지 않는다(중복 낭독 방지). */}
      <ScreenBackHeader />

      <div className="px-5 pb-10">
        <h1 className="text-2xl leading-[29px] font-bold text-foreground">{document.title}</h1>
        <p className="mt-2 text-[12px] leading-[15px] text-text-tertiary">
          {effectiveDateLabel(document)}
        </p>

        {document.intro !== undefined && (
          <p className="mt-[18px] text-[14px] leading-[22px] text-muted-foreground">
            {document.intro}
          </p>
        )}

        {document.sections.map((section) => (
          <section key={section.heading} className="mt-[26px]">
            <h2 className="text-[16px] leading-[20px] font-semibold text-foreground">
              {section.heading}
            </h2>
            {section.blocks.map((block, index) => (
              // 블록은 순서가 곧 정체성이라 인덱스를 키로 쓴다 — 재정렬·삽입이 일어나지 않는 정적 데이터다.
              <BlockView key={index} block={block} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
