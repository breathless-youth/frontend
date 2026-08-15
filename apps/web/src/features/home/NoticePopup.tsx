import { X } from "lucide-react";

import type { NoticeResponse } from "./notice";
import { UPDATE_NOTICE_DIM_COLOR } from "./UpdateNoticeSheet";

/**
 * U2 공지 팝업 (스펙: 2026-08-15-u2-notice-popup-design.md §4.3, BY-377.
 * Figma `FocusMakers-V1.4-Design` › `U2 · 공지 팝업 (배너형)` 2160:1375).
 *
 * **순수 프레젠테이션 컴포넌트다** — 어떤 공지를 띄울지(`notice.ts` 게이트)·상태 보유
 * (`NoticePopupHost`)를 모른다. 구성은 딤 + 중앙 카드: 배너 이미지(330×186, 있을 때만 —
 * 결정 8), 제목, 본문, "다시 보지 않기" 텍스트 버튼, "확인" CTA, 우상단 X.
 *
 * 닫기 동선은 정확히 세 개고 의미가 다르다(결정 4) — X·확인은 이번 방문만 닫음(`onClose`/
 * `onConfirm`), "다시 보지 않기"만 영구 dismiss(`onNeverShowAgain`). 콜백을 분리해 Host가
 * 저장 여부를 구분한다. 딤 탭 닫기는 없다(U1과 같은 결정 — 실수 탭으로 공지를 놓치지 않는다).
 *
 * X 아이콘은 lucide `X`를 쓴다 — 온보딩 `IconClose`는 코치 오버레이용 흰색 고정 stroke라
 * 밝은 카드 위에서 보이지 않는다.
 */
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
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
    >
      {/* 딤은 장식이다 — 탭해도 닫히지 않는다(닫기 동선은 세 개뿐). 색은 U1과 같은 결정을 공유한다. */}
      <div
        data-testid="notice-popup-dim"
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: UPDATE_NOTICE_DIM_COLOR }}
      />

      <div className="relative w-[330px] max-w-full overflow-hidden rounded-[24px] bg-background">
        {hasBanner && (
          // 운영자가 S3에 올린 홍보 배너 — 장식이라 대체 텍스트는 비운다(내용은 제목·본문이 전달).
          <img
            data-testid="notice-popup-banner"
            src={notice.imageUrl ?? undefined}
            alt=""
            className="h-[186px] w-full object-cover"
          />
        )}

        {/* 배너가 없어도 X는 카드 우상단 유지(결정 8). 배너 위에서는 흰색이어야 읽힌다. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className={
            hasBanner
              ? "absolute top-2 right-2 flex size-11 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
              : "absolute top-2 right-2 flex size-11 items-center justify-center text-muted-foreground"
          }
        >
          <X size={22} aria-hidden="true" />
        </button>

        <div
          className={
            hasBanner ? "flex flex-col gap-2 px-5 pt-5" : "flex flex-col gap-2 px-5 pt-[52px]"
          }
        >
          {/* U1 시트와 같은 실측 타이포(19/23 Bold) — U 계열 안내 레이어의 제목 관례. */}
          <h2
            id="notice-popup-title"
            className="text-[19px] leading-[23px] font-bold text-foreground"
          >
            {notice.title}
          </h2>
          {/* 본문 줄바꿈은 운영자가 넣은 그대로 살린다 — 공지는 DB 직접 INSERT로 작성된다(결정 E). */}
          <p className="text-[14px] leading-[21px] whitespace-pre-line text-muted-foreground">
            {notice.content}
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 px-5 pt-4 pb-4">
          {/* 스펙 §1의 구성 순서대로 텍스트 버튼이 CTA 위다. 영구 동작이라 CTA보다 시각 무게를 낮춘다. */}
          <button
            type="button"
            onClick={onNeverShowAgain}
            className="flex min-h-11 items-center text-[14px] text-text-tertiary underline underline-offset-2"
          >
            다시 보지 않기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-[52px] w-full shrink-0 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground transition-opacity duration-200 active:opacity-90 motion-reduce:transition-none"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
