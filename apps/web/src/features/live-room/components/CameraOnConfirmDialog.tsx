import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";

/**
 * 카메라 켜기 확인 모달
 *
 * ⚠️ 피그마 시안이 웹 모달 형태로 확정되기 전이라 스타일은 최소 구성이다 — 시안이 나오면
 * 이 파일의 표현만 교체한다. 구조·카피·접근성 계약은 확정분이다.
 * 미리보기 높이는 2026-08-25 BY-427 시안 B(234px) 확정.
 */
export interface CameraOnConfirmDialogProps {
  /** 미리보기 슬롯 — 호출부가 소유한 카메라 `<video>`를 넘긴다(다이얼로그는 표시만). */
  preview: ReactNode;
  /** 인라인 오류(입장 재시도 실패 등). 없으면 표시하지 않는다. */
  errorMessage?: string | null;
  /**
   * false면 Escape를 무시한다. 입장 확인처럼 취소가 곧 하나의 선택(끄고 입장)인 자리에서
   * Esc가 그 선택을 확정해 버리는 것을 막는다 — 버튼 탭으로만 결정하게 한다.
   */
  dismissable?: boolean;
  /** 확정 처리 중 — 두 버튼과 Escape를 잠가 중복 확정을 막는다. */
  busy?: boolean;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const FOCUSABLE = "button:not([disabled])";

export function CameraOnConfirmDialog({
  preview,
  errorMessage = null,
  dismissable = true,
  busy = false,
  cancelLabel = "취소",
  onCancel,
  onConfirm,
}: CameraOnConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (dismissable && !busy) {
        onCancel();
      }
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-dim px-8"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        // max-h+스크롤: 어떤 화면(특히 가로 회전)에서도 모달이 뷰포트를 넘어 잘리지 않는
        // 백스톱이다 — 내용은 아래 미리보기 높이가 비례로 줄어 대부분 스크롤 없이 들어간다.
        className="max-h-[calc(100dvh-24px)] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-background p-4 text-foreground"
      >
        <h2 id={titleId} className="text-[17px] leading-[21px] font-semibold">
          카메라를 켤까요?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-5 text-muted-foreground">
          카메라를 켜면 순공시간 측정과 영상 공유가 함께 시작돼요.
        </p>
        {/* 미리보기 높이는 화면 높이 비례(28dvh ≈ 표준 세로에서 234px) + 상한 234px —
            고정 px는 가로 회전(높이 ~390px)에서 모달을 뷰포트 밖으로 밀어 잘리게 했고,
            기기별로도 다르게 보였다(2026-08-25 피드백). 시안 B의 234px는 상한으로 유지. */}
        <div className="mt-3 h-[min(234px,28dvh)] overflow-hidden rounded-xl bg-[#191f28]">
          {preview}
        </div>
        <p className="mt-3 text-xs leading-[15px] text-muted-foreground">
          영상은 서버에 저장되지 않아요.
        </p>
        {errorMessage !== null && (
          <p role="alert" className="mt-2 text-sm text-state-distract-text">
            {errorMessage}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex h-12 flex-1 items-center justify-center rounded-[14px] bg-bg-layer-2 text-[15px] font-semibold text-foreground disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex h-12 flex-1 items-center justify-center rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            카메라 켜기
          </button>
        </div>
      </div>
    </div>
  );
}
