import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { setPremiumFakeDoorPriceUserProperty, trackPremiumFakeDoor } from "@/lib/amplitude";
import { isKoreanLocale } from "@/lib/i18n";
import { showCtaToast } from "@/lib/toast";
import { hasTokenSource } from "@/lib/userId";

import { PremiumEntryCard } from "./PremiumEntryCard";
import { PremiumFakeDoorFlow } from "./PremiumFakeDoorFlow";
import {
  assignPremiumPrice,
  canShowPremiumCard,
  PREMIUM_PLACEMENT,
  type PremiumPlacement,
} from "./premiumFakeDoor";
import { loadPremiumRecord, updatePremiumRecord } from "./premiumFakeDoorStore";

/**
 * 결과 화면의 스파르타 기능 사전 신청 카드와 신청 화면(코드 이름은 실험 시작 때의 premium을 그대로 쓴다)
 *
 * 홈에는 카드를 두지 않는다. 자리 값은 늘 `RESULT`다.
 * 방금 끝낸 세션의 기준 시간(카메라 세션은 순공, 자율 모드는 총 공부시간)이 10분 이상일 때만 보인다. 노출 여부는 마운트할 때 한 번 정한다.
 * X로 닫으면 48시간 동안 숨기고, 신청하면 다시 보이지 않는다. 열린 신청 화면은 완료까지 남는다.
 * 닫았다는 토스트는 결과 화면 아래 버튼 위의 `CtaToaster`로 보낸다.
 */
export function PremiumFakeDoorHost({
  userId,
  qualifyingSec,
}: {
  userId: number;
  /** 방금 끝낸 세션의 기준 시간(초, `premiumQualifyingSec`). 10분이 안 되면 카드를 그리지 않는다. */
  qualifyingSec: number;
}) {
  const placement = PREMIUM_PLACEMENT;
  const { t } = useTranslation("premium-fake-door");
  const price = assignPremiumPrice(userId);
  const base = { price, placement };
  const [visible, setVisible] = useState(() => {
    const record = loadPremiumRecord(userId);
    return (
      record !== null &&
      canShowPremiumCard({
        nowMs: Date.now(),
        hasTokenSource: hasTokenSource(),
        korean: isKoreanLocale(),
        record,
        qualifyingSec,
      })
    );
  });
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);

  // 노출은 사용자당 한 번만 보낸다. 기록을 먼저 쓰므로 StrictMode가 effect를 두 번 돌려도 한 번이다.
  useEffect(() => {
    if (!visible) return;
    const record = loadPremiumRecord(userId);
    if (record === null) return;
    if (!record.viewedSent) {
      updatePremiumRecord(userId, { viewedSent: true });
      trackPremiumFakeDoor("viewed", { price, placement });
      setPremiumFakeDoorPriceUserProperty(price);
    }
  }, [visible, userId, placement, price]);

  const priceLabel = t("price", { amount: price });

  return (
    <>
      {visible && (
        <PremiumEntryCard
          priceLabel={priceLabel}
          openRef={openRef}
          onOpen={() => {
            trackPremiumFakeDoor("opened", base);
            setOpen(true);
          }}
          onDismiss={() => {
            updatePremiumRecord(userId, { dismissedAt: Date.now() });
            trackPremiumFakeDoor("dismissed", base);
            setVisible(false);
            showCtaToast(t("card.dismissed"));
          }}
        />
      )}
      {open && (
        <PremiumFakeDoorUserFlow
          userId={userId}
          placement={placement}
          onApplied={() => setVisible(false)}
          onClose={() => {
            setOpen(false);
            openRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * 사용자 번호로 가격을 채운 신청 화면
 *
 * 결과 화면 카드와 세션 배너가 같은 가격, 같은 신청 기록을 쓰도록 둘 다 이것으로 연다.
 * 신청을 마치면 기록에 남겨 두 입구 모두 다시 권하지 않는다.
 */
export function PremiumFakeDoorUserFlow({
  userId,
  placement,
  onApplied,
  onClose,
}: {
  userId: number;
  placement: PremiumPlacement;
  onApplied?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("premium-fake-door");
  const price = assignPremiumPrice(userId);
  return (
    <PremiumFakeDoorFlow
      price={price}
      placement={placement}
      priceLabel={t("price", { amount: price })}
      onApplied={() => {
        updatePremiumRecord(userId, { applied: true });
        onApplied?.();
      }}
      onClose={onClose}
    />
  );
}
