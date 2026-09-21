import { type ReactNode, useRef } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * 카메라 켜기 확인 모달
 *
 * 공용 `ui/dialog.tsx`(Radix)를 쓴다. 포커스 트랩·복귀는 Radix 가 맡고, Escape 와 딤 탭만
 * 이 화면의 규칙에 맞게 막는다. 색은 전역 토큰이라 라이트·다크를 따르고 `body`로 포털해도
 * 문제없다 — 세션 변수를 읽는 종료 확인과 다른 점이다.
 *
 * ⚠️ 피그마 시안이 웹 모달 형태로 확정되기 전이라 스타일은 최소 구성이다 — 시안이 나오면
 * 이 파일의 표현만 교체한다. 구조·카피·접근성 계약은 확정분이다.
 * 미리보기 높이는 2026-08-25 BY-427 시안 B(234px) 확정.
 */
export interface CameraOnConfirmDialogProps {
  open: boolean;
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

export function CameraOnConfirmDialog({
  open,
  preview,
  errorMessage = null,
  dismissable = true,
  busy = false,
  cancelLabel = "취소",
  onCancel,
  onConfirm,
}: CameraOnConfirmDialogProps) {
  const restore = useRef<HTMLElement | null>(null);
  // 취소가 곧 하나의 선택(끄고 입장)인 자리다. 확정 중이거나 닫기를 막아 둔 동안에는
  // Escape 로 그 선택이 확정되지 않게 한다.
  const escapeAllowed = dismissable && !busy;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (!escapeAllowed) event.preventDefault();
        }}
        // 딤 탭으로는 닫지 않는다. 버튼으로만 결정하게 한다.
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          restore.current = active instanceof HTMLElement ? active : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (restore.current?.isConnected) restore.current.focus();
        }}
        // max-h+스크롤: 어떤 화면(특히 가로 회전)에서도 모달이 뷰포트를 넘어 잘리지 않는
        // 백스톱이다 — 내용은 아래 미리보기 높이가 비례로 줄어 대부분 스크롤 없이 들어간다.
        // gap-0 으로 DialogContent 기본 grid gap 을 눌러 아래 mt-* 간격을 그대로 쓴다.
        className="max-h-[calc(100dvh-24px)] w-full max-w-[320px] gap-0 overflow-y-auto rounded-2xl border-0 bg-background p-4 text-foreground sm:rounded-2xl"
      >
        <DialogTitle className="text-[17px] leading-[21px] font-semibold">
          카메라를 켤까요?
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-5 text-muted-foreground">
          카메라를 켜면 순공시간 측정과 영상 공유가 함께 시작돼요.
        </DialogDescription>
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
      </DialogContent>
    </Dialog>
  );
}
