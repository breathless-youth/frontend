import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

import type { ShopItem } from "../../types";
import { PointAmount } from "./PointAmount";

/**
 * 구매 확인 시트
 *
 * 구매 후 포인트는 확인을 돕는 미리 보기일 뿐이고, 산 뒤의 잔액은 경계가 돌려준 값을 쓴다.
 * 시트는 body로 나가므로 Soft Blue 테마를 시트에도 단다.
 */
export function PurchaseConfirmSheet({
  open,
  pending = false,
  item,
  balance,
  onConfirm,
  onClose,
}: {
  open: boolean;
  pending?: boolean;
  item: ShopItem | null;
  balance: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("points");
  const price = item?.acquire.type === "price" ? item.acquire.price : 0;
  return (
    <Drawer open={open && item !== null} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="theme-soft-blue">
        <div className="flex flex-col gap-2.5 pt-4">
          <DrawerTitle className="text-lg font-bold break-keep">
            {t("purchase.title", { name: item?.name ?? "" })}
          </DrawerTitle>
          <Row label={item?.name ?? ""} value={price} />
          <Row label={t("purchase.balanceAfter")} value={balance - price} />
          <div className="mt-1.5 flex gap-2">
            <Button variant="secondary" size="xl" className="flex-1" onClick={onClose}>
              {t("purchase.cancel")}
            </Button>
            <Button size="xl" className="flex-1" disabled={pending} onClick={onConfirm}>
              {t("purchase.confirm")}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-bg-layer-2 px-3.5 py-3 text-sm">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <PointAmount value={value} />
    </div>
  );
}
