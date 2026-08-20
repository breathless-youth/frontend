import type { NoticeResponse } from "./notice";

/**
 * U1 공지 팝업 (스펙: 2026-08-15-u2-notice-popup-design.md §4.3, BY-377.
 * Figma `FocusMakers-V1.4-Design` › `U1 · 공지 팝업 (배너형)` 2160:1375, 카드 2161:1568 실측.
 * U 번호 재지정: 과거 U1 업데이트 안내 시트가 2026-08-16 삭제되며 공지 팝업이 U1이 됐다).
 *
 * **순수 프레젠테이션 컴포넌트다** — 어떤 공지를 띄울지(`notice.ts` 게이트)·상태 보유
 * (`NoticePopupHost`)를 모른다. 구성은 딤 + 중앙 카드(330, r20): 배너 이미지(330×186,
 * 있을 때만 — 결정 8), 제목, 본문, 하단 한 줄에 "다시 보지 않기"(좌)·"확인"(우), 배너 우상단 X.
 *
 * 닫기 동선은 정확히 세 개고 의미가 다르다(결정 4) — X·확인은 이번 방문만 닫음(`onClose`/
 * `onConfirm`), "다시 보지 않기"만 영구 dismiss(`onNeverShowAgain`). 콜백을 분리해 Host가
 * 저장 여부를 구분한다. 딤 탭 닫기는 없다 — 실수 탭으로 공지를 놓치지 않는다.
 *
 * 딤은 Figma 실측 40%로, 시맨틱 `--dim` 토큰과 일치해 토큰(`bg-dim`)을 쓴다.
 */

/**
 * 배너 우상단 X (Figma `Close Button` 2161:1571 에셋 지오메트리 그대로: 32×32 원형
 * black 25% + 흰 X stroke 1.8). 원이 자체 배경을 가져 배너 위에서도 흰 카드 위에서도 읽힌다 —
 * 온보딩 `IconClose`(흰색 고정)나 lucide를 쓰지 않는 이유.
 */
function CloseButtonGlyph() {
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width={32} height={32} rx={16} fill="black" fillOpacity={0.25} />
      <path d="M10 10L22 22M22 10L10 22" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

export function NoticePopup({
  notice,
  onConfirm,
  onClose,
  onNeverShowAgain,
}: {
  notice: NoticeResponse;
  /** `확인` CTA — 이번 방문만 닫는다. */
  onConfirm: () => void;
  /** 우상단 X — 이번 방문만 닫는다(확인과 같은 의미, 위치만 다르다). */
  onClose: () => void;
  /** "다시 보지 않기" — 이 공지를 영구 dismiss한다. */
  onNeverShowAgain: () => void;
}) {
  const hasBanner = notice.imageUrl !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-popup-title"
      data-testid="notice-popup"
      className="fixed inset-0 z-50 flex items-center justify-center px-9"
    >
      {/* 딤은 장식이다 — 탭해도 닫히지 않는다(닫기 동선은 세 개뿐). */}
      <div data-testid="notice-popup-dim" aria-hidden="true" className="absolute inset-0 bg-dim" />

      <div className="relative w-[330px] max-w-full overflow-hidden rounded-[20px] bg-background shadow-[0px_20px_50px_0px_rgba(0,0,0,0.25)]">
        {hasBanner && (
          // 운영자가 S3에 올린 홍보 배너 — 장식이라 대체 텍스트는 비운다(내용은 제목·본문이 전달).
          <img
            data-testid="notice-popup-banner"
            src={notice.imageUrl ?? undefined}
            alt=""
            className="h-[186px] w-full object-cover"
          />
        )}

        {/*
          X 시각 크기는 Figma 실측 32(우상단 12px 오프셋), 히트 영역은 44로 넓힌다
          (6px 여백 + 32 + 6px = 시각 위치는 실측 그대로). 배너가 없어도 카드 우상단 유지(결정 8).
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-1.5 right-1.5 flex size-11 items-center justify-center"
        >
          <CloseButtonGlyph />
        </button>

        <div className="flex w-full flex-col gap-2 px-6 pt-5 pb-4">
          <h2
            id="notice-popup-title"
            className={
              // 배너가 없으면 제목이 X 자리(우상단)와 겹치지 않게 오른쪽을 비워 둔다(결정 8).
              hasBanner
                ? "text-[18px] leading-6 font-bold text-foreground"
                : "pr-10 text-[18px] leading-6 font-bold text-foreground"
            }
          >
            {notice.title}
          </h2>
          {/* 본문 줄바꿈은 운영자가 넣은 그대로 살린다 — 공지는 DB 직접 INSERT로 작성된다(결정 E). */}
          <p className="text-[14px] leading-[21px] whitespace-pre-line text-muted-foreground">
            {notice.content}
          </p>
        </div>

        <div className="flex w-full items-center justify-between px-6 pt-1 pb-[18px]">
          {/* 영구 동작이라 CTA보다 시각 무게가 낮은 플레인 텍스트다(Figma 2161:1577 — 밑줄 없음). */}
          <button
            type="button"
            onClick={onNeverShowAgain}
            className="flex min-h-11 items-center text-[13px] font-medium text-text-tertiary"
          >
            다시 보지 않기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-11 shrink-0 rounded-md bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-opacity duration-200 active:opacity-90 motion-reduce:transition-none"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
