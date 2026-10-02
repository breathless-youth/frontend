import { type VariantProps, cva } from "class-variance-authority";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";
import { cn } from "@/lib/utils";

/**
 * 세션 위에 뜨는 확인 다이얼로그 (Figma `Dialog / Confirm` 40:104 · 화면 S3-7 `63:458`).
 *
 * 공용 `ui/dialog.tsx`(Radix)를 쓴다. 포커스 트랩·복귀·Escape·딤 차단은 Radix 가 맡고,
 * 여기서는 세션 색과 버튼 배치만 정한다.
 *
 * ## 항상 다크
 *
 * 카메라 위에 뜨는 오버레이라 **라이트/다크 테마를 따르지 않는다.** 색은 전부
 * `sessionTheme.ts`가 `<main>`에 주입한 `--session-dialog-*` 변수(= 토큰의 다크 값 고정)를
 * 읽는다. 포털이 `body`로 나가면 그 변수가 풀리므로 호출부가 세션 `<main>`을 `container`로
 * 넘겨야 한다. 같은 이유로 다크 SM 버튼 variant를 공용 `components/ui/button.tsx`에 올리지
 * 않았다 — 그 변수는 세션 서브트리 밖에 없어 다른 화면에서 쓰면 색 없는 버튼이 된다.
 *
 * ## 접근성
 *
 * `role="alertdialog"`, 초기 포커스는 비파괴 버튼(`계속하기`), 포커스 트랩과 복귀는 Radix 가
 * 처리한다. Radix 는 Trigger 로 열 때만 포커스를 되돌리는데 여기는 `open`으로만 여므로,
 * 열리기 직전의 포커스를 기억해 닫힐 때 돌려준다.
 */

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const dialogActionVariants = cva(
  // 136×48 r14 — 반경 14는 radius 스케일에 없는 Figma 실측값이라 12/16으로 반올림하지 않는다.
  // 폭은 고정하지 않고 flex로 나눈다: 330w 다이얼로그에서 정확히 136px이 되고, 더 좁은
  // 뷰포트에서는 최소 터치 타겟(높이 48)을 지키며 함께 줄어든다.
  "flex h-12 flex-1 items-center justify-center rounded-[14px] text-[15px] leading-[18px] font-semibold text-white transition-opacity duration-200 active:opacity-80 motion-reduce:transition-none",
  {
    variants: {
      tone: {
        /** 비파괴(`계속하기`) — Figma `Button / CTA` Dark Secondary SM. */
        cancel: "bg-[var(--session-dialog-cancel-bg)]",
        /** 종료(`공부 종료`) — Dark Primary SM. */
        confirm: "bg-[var(--session-dialog-confirm-bg)]",
      },
    },
    defaultVariants: { tone: "cancel" },
  },
);

export type SessionConfirmDialogTone = NonNullable<
  VariantProps<typeof dialogActionVariants>["tone"]
>;

export interface SessionConfirmDialogProps {
  open: boolean;
  /** 포털 자리. 색이 세션 서브트리 변수라 반드시 그 안이어야 한다. */
  container?: HTMLElement | null;
  title: string;
  description: string;
  /** 비파괴 액션 라벨. 초기 포커스가 여기에 놓인다. */
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}

export function SessionConfirmDialog({
  open,
  container,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  className,
}: SessionConfirmDialogProps) {
  const focusRestore = useDialogFocusRestore();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 종료는 되돌릴 수 없으므로 Escape 와 딤 탭은 **비파괴 기본값**(= `계속하기`)으로 보낸다.
        if (!next) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        container={container}
        overlayClassName="bg-[var(--session-dim)]"
        showCloseButton={false}
        onOpenAutoFocus={focusRestore.onOpenAutoFocus}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        // 폰트 확대에서 본문이 잘리지 않도록 높이를 고정하지 않는다. 그림자는 Figma 실측값.
        className={cn(
          // sm:rounded-xl 로 공용 클래스의 sm:rounded-lg 를 덮는다. 안 그러면 640px 이상에서
          // 반경이 20px 에서 16px 로 줄어든다(같은 modifier 라야 tailwind-merge 가 이긴다).
          "flex w-[330px] max-w-[calc(100%-72px)] flex-col gap-[18px] rounded-xl border-0 bg-[var(--session-dialog-bg)] p-6 shadow-[0_20px_50px_0_rgba(0,0,0,0.45)] sm:rounded-xl",
          className,
        )}
      >
        <div className="flex flex-col gap-2">
          <DialogTitle className="text-[18px] leading-[21px] font-bold text-[var(--session-dialog-title)]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-[20px] text-[var(--session-dialog-body)]">
            {description}
          </DialogDescription>
        </div>
        <div className="flex gap-[10px]">
          <button
            type="button"
            onClick={onCancel}
            className={dialogActionVariants({ tone: "cancel" })}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={dialogActionVariants({ tone: "confirm" })}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
