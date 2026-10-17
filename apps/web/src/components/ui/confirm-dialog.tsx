import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

/**
 * 시트 위에 뜨는 확인 다이얼로그
 *
 * 설명 줄 없이 제목과 두 버튼만 두고, 확인 버튼은 오류색으로 채운다.
 * Esc와 딤 탭은 취소다.
 * 시트가 `open`으로만 열어 Radix가 포커스를 되돌리지 못하므로 `useDialogFocusRestore`가 맡는다.
 */
export function ConfirmDialog({
  open,
  title,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const focusRestore = useDialogFocusRestore();
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
        onOpenAutoFocus={focusRestore.onOpenAutoFocus}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        className="theme-soft-blue w-full max-w-[320px] gap-0 rounded-3xl border-0 bg-muted px-5.5 pt-6.5 pb-5.5 text-foreground shadow-[0_20px_25px_rgba(0,0,0,0.4)] sm:rounded-3xl"
        // 설명 없는 다이얼로그다. 비워 두면 Radix가 aria-describedby 누락을 경고한다.
        aria-describedby={undefined}
      >
        <DialogTitle className="text-[18px] leading-5.25 font-bold text-foreground">
          {title}
        </DialogTitle>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="h-13 flex-1 rounded-lg bg-bg-layer-2 text-[15px] font-semibold text-foreground"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="unstyled"
            onClick={onConfirm}
            className="h-13 flex-1 rounded-lg bg-feedback-danger text-[15px] font-semibold text-white hover:opacity-90"
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
