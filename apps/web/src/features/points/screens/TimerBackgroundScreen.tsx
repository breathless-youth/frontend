import { useTranslation } from "react-i18next";

import { PointsScreenFrame } from "../components/shared/PointsScreenFrame";
import type { ShopData } from "../types";

/** 자리 표시 화면이며 다음 작업에서 채운다. */
export function TimerBackgroundScreen({
  balance,
  onBack,
}: {
  data: ShopData;
  balance: number;
  onBack: () => void;
}) {
  const { t } = useTranslation("points");
  return (
    <PointsScreenFrame title={t("titles.backgrounds")} onBack={onBack} balance={balance}>
      {null}
    </PointsScreenFrame>
  );
}
