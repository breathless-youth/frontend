import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { SettingsRow } from "@/features/settings/SettingsRow";
import { slideNavigate } from "@/lib/pageTransition";

import { useRestorePurchases } from "../../model/useRestorePurchases";
import { usePointsAccess } from "../../usePointsAccess";

/**
 * 설정의 구매 복원 줄
 *
 * 결제 상품은 회원만 사므로 복원도 회원만 한다.
 * 비회원에게도 줄은 보이고, 누르면 복원하는 대신 설정의 로그인 화면으로 보낸다.
 * 다만 비회원은 서버가 포인트 조회를 거절할 수 있어서, 조회가 열린 것을 확인한 뒤에만 줄을 그린다.
 * 줄을 그릴 곳에서만 회원 여부를 묻도록 판정을 이 부품 안에 둔다.
 */
export function RestorePurchasesRow({ readable }: { readable: boolean }) {
  const { t } = useTranslation("points-shop");
  const navigate = useNavigate();
  const location = useLocation();
  const access = usePointsAccess();
  const { restore } = useRestorePurchases(access.status === "member" ? access.userId : null);
  const member = access.status === "member";
  if (!member && !(access.status === "guest" && readable)) {
    return null;
  }
  return (
    <SettingsRow
      label={t("settings.restore")}
      onPress={() => {
        if (member) {
          void restore();
          return;
        }
        slideNavigate("forward", () =>
          navigate({ pathname: "/settings/login", search: location.search }),
        );
      }}
    />
  );
}
