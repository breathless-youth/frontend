import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * 강제 버전 업데이트 모달
 *
 * 앱 버전이 최소 버전 미만일 때 뜬다.
 * X 버튼 없음, Escape·바깥 클릭 모두 무시한다.
 */
export interface ForceUpdateDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function ForceUpdateDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
}: ForceUpdateDialogProps) {
  return (
    <Dialog open>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-[360px] rounded-lg"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Button variant="default" size="lg" className="w-full" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
