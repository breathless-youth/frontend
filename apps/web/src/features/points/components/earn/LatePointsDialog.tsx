import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

/**
 * 결제는 끝났는데 포인트가 아직 들어오지 않았을 때의 창
 *
 * 돈은 이미 나갔으므로 다시 결제하는 길을 두지 않고, 오래 안 들어오는 사람을 위해 문의 길만 둔다.
 */
export function LatePointsDialog({
  open,
  onClose,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  /** 결제로 산 상품이 늦을 때처럼 포인트가 아닌 것을 기다리면 문구를 바꾼다. */
  copy?: { title: string; body: string; missing: string };
}) {
  const { t } = useTranslation("points-earn");
  const focusRestore = useDialogFocusRestore();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={focusRestore.onOpenAutoFocus}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        className="theme-soft-blue w-[calc(100%-64px)] max-w-[320px] gap-2 rounded-xl border-0 bg-muted px-5 pt-6 pb-3 text-center sm:rounded-xl"
      >
        <Clock aria-hidden className="mx-auto mb-1 size-10 text-primary" />
        <DialogTitle className="text-[17px] font-bold break-keep">
          {copy?.title ?? t("late.title")}
        </DialogTitle>
        <DialogDescription className="mb-2 text-sm break-keep text-muted-foreground">
          {copy?.body ?? t("late.body")}
        </DialogDescription>
        <Button size="xl" onClick={onClose}>
          {t("late.ok")}
        </Button>
        <Link
          to="/contact"
          className="flex min-h-11 items-center self-center text-[13px] font-semibold text-muted-foreground underline"
        >
          {copy?.missing ?? t("late.missing")}
        </Link>
      </DialogContent>
    </Dialog>
  );
}
