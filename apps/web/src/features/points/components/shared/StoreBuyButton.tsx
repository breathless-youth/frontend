import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import type { useStorePurchase } from "../../model/useStorePurchase";
import type { ShopItem } from "../../types";

/**
 * 스토어 결제 상품의 구매 버튼
 *
 * 가격은 스토어가 답한 뒤에 붙고, 결제를 맡을 수 없는 곳에서는 앱에서 살 수 있다고만 알린다.
 */
export function StoreBuyButton({
  item,
  flow,
  className,
}: {
  item: ShopItem;
  flow: ReturnType<typeof useStorePurchase>;
  className?: string;
}) {
  const { t } = useTranslation("points");
  if (!flow.available) {
    return (
      <Button size="xl" variant="secondary" className={className} disabled>
        {t("storeItem.appOnly")}
      </Button>
    );
  }
  const price = flow.priceLabel(item);
  return (
    <Button
      size="xl"
      className={className}
      disabled={flow.step === "paying" || flow.step === "waiting"}
      onClick={() => void flow.buy(item)}
    >
      {price === null ? t("storeItem.buy") : t("storeItem.buyFor", { price })}
    </Button>
  );
}
