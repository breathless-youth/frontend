import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useBackDismiss } from "@/lib/backDismiss";

const GUIDE_LINES = [
  "unusedPaid",
  "spent",
  "setUnworn",
  "setWorn",
  "deleteAccount",
  "storeRefund",
  "negative",
  "minor",
] as const;

/**
 * 결제·환불 안내 링크와 그 창
 *
 * 충전 칸과 세트 결제 버튼 위에 같은 모양으로 두고 같은 안내를 연다.
 * 화면에는 링크 한 줄만 두고 자세한 환불 규칙은 창 안에 모은다.
 * 앱은 웹뷰가 다른 주소로 나가는 것을 막아서 이용약관은 앱 안의 약관 화면으로 연다.
 */
export function PaymentGuideLink() {
  const { t } = useTranslation("points-earn");
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* 글자는 작게 두고 누르는 범위만 위아래로 넓힌다. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative self-center text-[11px] font-medium text-muted-foreground/80 underline underline-offset-2 before:absolute before:-inset-x-3 before:-inset-y-4"
      >
        {t("charge.guide")}
      </button>
      <PaymentGuideSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PaymentGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("points-earn");
  useBackDismiss(open, onClose);
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="theme-soft-blue">
        <div className="flex flex-col gap-3 pt-4">
          <DrawerTitle className="text-lg font-bold break-keep">{t("charge.guide")}</DrawerTitle>
          <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-[13px] leading-5 break-keep text-muted-foreground">
            {GUIDE_LINES.map((line) => (
              <li key={line}>{t(`paymentGuide.${line}`)}</li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 rounded-[14px] bg-bg-layer-2 px-3.5 py-3 text-[13px] break-keep">
            <p className="text-muted-foreground">{t("paymentGuide.contact")}</p>
            <Link
              to="/contact"
              className="flex min-h-11 items-center self-start font-semibold text-primary underline underline-offset-2"
            >
              {t("paymentGuide.contactAction")}
            </Link>
            <p className="text-muted-foreground">{t("paymentGuide.seller")}</p>
            <Link
              to="/terms"
              className="flex min-h-11 items-center self-start font-semibold text-primary underline underline-offset-2"
            >
              {t("paymentGuide.terms")}
            </Link>
          </div>
          <Button size="xl" variant="secondary" className="w-full" onClick={onClose}>
            {t("paymentGuide.close")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
