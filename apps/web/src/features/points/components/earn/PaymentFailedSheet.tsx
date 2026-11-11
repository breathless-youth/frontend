import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

/** 결제가 실패하거나 취소됐을 때의 시트이며 포인트가 안 들어온 사람을 위해 문의 길을 둔다. */
export function PaymentFailedSheet({
  open,
  onClose,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation("points-earn");
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="theme-soft-blue">
        <div className="flex flex-col gap-2.5 pt-4">
          <DrawerTitle className="text-lg font-bold break-keep">{t("failed.title")}</DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">
            {t("failed.body")}
          </DrawerDescription>
          <div className="mt-1.5 flex gap-2">
            <Button variant="secondary" size="xl" className="flex-1" onClick={onClose}>
              {t("failed.close")}
            </Button>
            <Button size="xl" className="flex-1" onClick={onRetry}>
              {t("failed.retry")}
            </Button>
          </div>
          <Link
            to="/contact"
            className="flex min-h-11 items-center self-center text-[13px] font-semibold text-muted-foreground underline"
          >
            {t("failed.missing")}
          </Link>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
