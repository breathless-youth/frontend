import { useTranslation } from "react-i18next";

import type { useStorePurchase } from "../../model/useStorePurchase";
import { ChargingDialog } from "../earn/ChargingDialog";
import { LatePointsDialog } from "../earn/LatePointsDialog";
import { PaymentFailedSheet } from "../earn/PaymentFailedSheet";

/**
 * 스토어 결제 상품을 살 때 뜨는 창 묶음
 *
 * 포인트 충전과 같은 창을 쓰고 문구만 상품에 맞게 바꾼다.
 */
export function StorePurchaseDialogs({ flow }: { flow: ReturnType<typeof useStorePurchase> }) {
  const { t } = useTranslation("points");
  return (
    <>
      <ChargingDialog open={flow.step === "waiting"} title={t("storeItem.buying")} />
      <LatePointsDialog
        open={flow.step === "late"}
        onClose={flow.close}
        copy={{
          title: t("storeItem.lateTitle"),
          body: t("storeItem.lateBody"),
          missing: t("storeItem.lateMissing"),
        }}
      />
      <PaymentFailedSheet
        open={flow.step === "failed"}
        onClose={flow.close}
        onRetry={flow.retry}
        missing={t("storeItem.failedMissing")}
      />
    </>
  );
}
