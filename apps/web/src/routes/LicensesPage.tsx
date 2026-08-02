import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { APACHE_LICENSE_2_0, OPEN_SOURCE_ENTRIES } from "@/features/settings/openSourceLicenses";

/**
 * 오픈소스 라이선스 — 설정(S6) `약관 · 정보` 섹션에서 진입한다(BY-310).
 *
 * 항목·전문은 `features/settings/openSourceLicenses.ts`가 소유한다 — 어떤 항목을 왜 고지하는지의
 * 판단(재배포 여부)은 그 파일 주석 참고. 이 화면은 표시만 한다.
 *
 * 의도적으로 **꾸미지 않는다**(2026-08-02 확정) — 카드·섹션 박스 없이 통상적인 서드파티
 * 고지문처럼 텍스트를 연속으로 흘린다. 법적 고지는 존재가 목적이지 체류 화면이 아니다.
 */
export function LicensesPage() {
  return (
    <div className="min-h-dvh bg-background">
      {/* 제목은 본문 첫 줄이 크게 그린다 — 상단 바에 또 넣지 않는다(약관·방침과 같은 규칙). */}
      <ScreenBackHeader />

      <div className="px-5 pb-10 text-[13px] leading-[19px] text-muted-foreground">
        {/* 페이지 문구는 영어로 통일한다 — 근거는 `openSourceLicenses.ts` 파일 주석. */}
        <h1 className="text-2xl leading-[29px] font-bold text-foreground">Open Source Licenses</h1>
        <p className="mt-[18px]">
          FocusMakers uses the following open source software and models. All of them run entirely
          on your device, and each is distributed under the terms of the Apache License 2.0.
        </p>

        {/*
          원문 그대로라 영어다 — 법적 문서는 번역·요약하지 않는다(`openSourceLicenses.ts` 주석).
          `whitespace-pre-wrap`: 원문 줄바꿈은 지키되 긴 문단은 화면 폭에서 접는다 — `pre` 기본값
          (nowrap)이면 웹뷰에서 가로 스크롤이 생긴다.
        */}
        <pre className="mt-6 font-sans text-[12px] leading-[18px] whitespace-pre-wrap break-words">
          {APACHE_LICENSE_2_0}
        </pre>

        {/* 항목은 최하단에 강조·개행·구분 기호 없이 한 문단으로 잇는다(2026-08-02 확정 —
            위 "꾸미지 않는다"의 연장). 이름과 설명도 띄어쓰기로만 구분한다. */}
        <p className="mt-6">
          {OPEN_SOURCE_ENTRIES.map(
            (entry) =>
              `${entry.name} ${entry.role} ${entry.copyright}. ${entry.license}. ${entry.source}.`,
          ).join(" ")}
        </p>
      </div>
    </div>
  );
}
