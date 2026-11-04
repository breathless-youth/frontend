import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";
import { cn } from "@/lib/utils";

const CONFIRM_TONE_CLASS = {
  danger: "bg-feedback-danger text-white",
  primary: "bg-primary text-primary-foreground",
} as const;

/**
 * 시트나 화면 위에 뜨는 확인 다이얼로그
 *
 * 설명은 넘길 때만 제목 아래 한 줄로 두고, 없으면 제목과 두 버튼만 남는다.
 * 확인 버튼은 삭제하거나 내보내는 일을 경고하려고 기본으로 오류색을 채운다.
 * 경고할 일이 아닌 확인은 `confirmTone="primary"`로 브랜드색을 채운다.
 * Esc와 딤 탭은 취소다.
 * 확인한 일을 보내는 중(`pending`)에는 같은 요청이 두 번 나가지 않게 확인을 막고, 결과가 오기 전에 창이 사라지지 않게 취소와 닫기도 막는다.
 * 시트가 `open`으로만 열어 Radix가 포커스를 되돌리지 못하므로 `useDialogFocusRestore`가 맡는다.
 * 창은 body로 나가서 화면에 단 클릭 분석 가림이 닿지 않으므로 다른 사람의 이름이 든 문구는 `maskFromAnalytics`로 창에서 가린다.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmTone = "danger",
  pending = false,
  maskFromAnalytics = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmTone?: "danger" | "primary";
  pending?: boolean;
  /** 켜면 Amplitude 클릭 자동 수집이 창 안의 글자와 aria-label을 싣지 않는다. */
  maskFromAnalytics?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const focusRestore = useDialogFocusRestore();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onOpenAutoFocus={focusRestore.onOpenAutoFocus}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        data-amp-mask={maskFromAnalytics || undefined}
        data-amp-mask-attributes={maskFromAnalytics ? "aria-label" : undefined}
        className="theme-soft-blue w-full max-w-[320px] gap-0 rounded-3xl border-0 bg-muted px-5.5 pt-6.5 pb-5.5 text-foreground shadow-[0_20px_25px_rgba(0,0,0,0.4)] sm:rounded-3xl"
        // 설명이 없을 때 이 속성을 비워 넘기지 않으면 Radix가 설명 누락을 경고한다.
        // 설명이 있으면 Radix가 설명 줄을 가리키는 기본 동작을 유지한다.
        {...(description === undefined ? { "aria-describedby": undefined } : {})}
      >
        <DialogTitle className="text-[18px] leading-5.25 font-bold text-foreground">
          {title}
        </DialogTitle>
        {description !== undefined && (
          <DialogDescription className="mt-2 text-sm leading-5 text-muted-foreground">
            {description}
          </DialogDescription>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onCancel}
            className="h-13 flex-1 rounded-lg bg-bg-layer-2 text-[15px] font-semibold text-foreground"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="unstyled"
            data-tone={confirmTone}
            disabled={pending}
            onClick={onConfirm}
            className={cn(
              "h-13 flex-1 rounded-lg text-[15px] font-semibold hover:opacity-90",
              CONFIRM_TONE_CLASS[confirmTone],
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
