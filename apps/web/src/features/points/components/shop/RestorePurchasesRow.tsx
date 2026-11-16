import { useTranslation } from "react-i18next";

import { SettingsRow } from "@/features/settings/SettingsRow";

import { useRestorePurchases } from "../../model/useRestorePurchases";
import { usePointsAccess } from "../../usePointsAccess";

/**
 * 설정의 구매 복원 줄
 *
 * 결제 상품은 회원만 사므로 회원으로 확인된 사용자에게만 보인다.
 * 줄을 그릴 곳에서만 회원 여부를 묻도록 판정을 이 부품 안에 둔다.
 */
export function RestorePurchasesRow() {
  const { t } = useTranslation("points-shop");
  const access = usePointsAccess();
  const { restore } = useRestorePurchases(access.status === "member" ? access.userId : null);
  if (access.status !== "member") {
    return null;
  }
  return <SettingsRow label={t("settings.restore")} onPress={() => void restore()} />;
}
