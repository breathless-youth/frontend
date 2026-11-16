import { useTranslation } from "react-i18next";

import { useBackTo } from "@/features/group-room/useBackTo";
import { PaymentGuideContent } from "@/features/points/components/shared/PaymentGuide";
import { PointsScreenFrame } from "@/features/points/components/shared/PointsScreenFrame";
import { useScrollTopOnEnter } from "@/lib/useScrollTopOnEnter";

/**
 * 결제·환불 안내
 *
 * 포인트 받기 탭의 충전 칸과 세트 결제 버튼 위 링크에서 들어온다.
 * 서버 값을 읽지 않는 안내라 비회원도 로그인 없이 보고, 잔액 알약은 그리지 않는다.
 * 새로 들어올 때는 앞 화면에서 내린 위치가 아니라 맨 위에서 연다.
 * 앞 화면이 없으면 뒤로 가기는 포인트 상점으로 간다.
 */
export function PointsPaymentGuidePage() {
  const { t } = useTranslation("points-earn");
  const back = useBackTo("/points");
  useScrollTopOnEnter();
  return (
    <PointsScreenFrame title={t("charge.guide")} onBack={back} balance={null}>
      <PaymentGuideContent />
    </PointsScreenFrame>
  );
}
