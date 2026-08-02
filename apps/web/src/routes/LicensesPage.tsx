import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { APACHE_LICENSE_2_0, OPEN_SOURCE_ENTRIES } from "@/features/settings/openSourceLicenses";

/**
 * 오픈소스 라이선스 — 설정(S6) `약관 · 정보` 섹션에서 진입한다(BY-310).
 *
 * 항목·전문은 `features/settings/openSourceLicenses.ts`가 소유한다 — 어떤 항목을 왜 고지하는지의
 * 판단(재배포 여부)은 그 파일 주석 참고. 이 화면은 표시만 한다.
 *
 * 약관·방침(`LegalDocumentScreen`)과 렌더러를 공유하지 않는 이유: 그 구조(`effectiveDate`·조항)는
 * 시행일 있는 법적 문서의 모양이고, 여기는 "항목 카드 목록 + 라이선스 전문"이라 억지로 끼우면
 * 두 화면 다 어색해진다. 시각 언어(간격·타이포)는 같은 값을 쓴다.
 */
export function LicensesPage() {
  return (
    <div className="min-h-dvh bg-background">
      {/* 제목은 본문 첫 줄이 크게 그린다 — 상단 바에 또 넣지 않는다(약관·방침과 같은 규칙). */}
      <ScreenBackHeader />

      <div className="px-5 pb-10">
        {/* 페이지 문구는 영어로 통일한다 — 근거는 `openSourceLicenses.ts` 파일 주석. */}
        <h1 className="text-2xl leading-[29px] font-bold text-foreground">Open Source Licenses</h1>
        <p className="mt-[18px] text-[14px] leading-[22px] text-muted-foreground">
          FocusMakers uses the following open source software and models. All of them run entirely
          on your device, and each is distributed under the terms of the Apache License 2.0.
        </p>

        {OPEN_SOURCE_ENTRIES.map((entry) => (
          <section
            key={entry.name}
            className="mt-4 flex flex-col gap-[6px] rounded-lg border border-border bg-muted p-[14px]"
          >
            <h2 className="text-[16px] leading-[20px] font-semibold text-foreground">
              {entry.name}
            </h2>
            <p className="text-[14px] leading-[22px] text-muted-foreground">{entry.role}</p>
            <p className="text-[13px] leading-[19px] text-text-tertiary">
              {entry.copyright} · {entry.license}
            </p>
            <p className="text-[13px] leading-[19px] text-text-tertiary">{entry.source}</p>
          </section>
        ))}

        <section className="mt-[26px]">
          <h2 className="text-[16px] leading-[20px] font-semibold text-foreground">
            Apache License 2.0
          </h2>
          {/*
            원문 그대로라 영어다 — 법적 문서는 번역·요약하지 않는다(`openSourceLicenses.ts` 주석).
            `whitespace-pre-wrap`: 원문 줄바꿈은 지키되 긴 문단은 화면 폭에서 접는다 — `pre` 기본값
            (nowrap)이면 웹뷰에서 가로 스크롤이 생긴다.
          */}
          <pre className="mt-3 rounded-lg border border-border bg-muted p-[14px] text-[12px] leading-[18px] whitespace-pre-wrap break-words text-muted-foreground">
            {APACHE_LICENSE_2_0}
          </pre>
        </section>
      </div>
    </div>
  );
}
