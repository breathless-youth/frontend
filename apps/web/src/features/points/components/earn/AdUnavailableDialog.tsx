import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

/** 지금 볼 수 있는 광고가 없을 때 뜨는 알림 창 */
export function AdUnavailableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("points-earn");
  const focusRestore = useDialogFocusRestore();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onOpenAutoFocus={focusRestore.onOpenAutoFocus}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        className="theme-soft-blue w-[calc(100%-64px)] max-w-[320px] gap-2 rounded-xl border-0 bg-muted p-5 text-center sm:rounded-xl"
      >
        <DialogTitle className="text-[17px] font-bold break-keep">
          {t("adUnavailable.title")}
        </DialogTitle>
        <DialogDescription className="mb-1.5 text-sm text-muted-foreground">
          {t("adUnavailable.body")}
        </DialogDescription>
        <Button size="xl" onClick={onClose}>
          {t("adUnavailable.ok")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
