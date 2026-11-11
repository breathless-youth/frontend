import { useTranslation } from "react-i18next";

import { PointsScreenFrame } from "../components/shared/PointsScreenFrame";
import type { MascotId, ShopData } from "../types";

/** 자리 표시 화면이며 다음 작업에서 채운다. */
export function MascotCollectionScreen({
  balance,
  onBack,
}: {
  data: ShopData;
  balance: number;
  onSelect: (id: MascotId) => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useTranslation("points");
  return (
    <PointsScreenFrame title={t("titles.mascots")} onBack={onBack} balance={balance}>
      {null}
    </PointsScreenFrame>
  );
}
