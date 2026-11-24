import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { setPremiumFakeDoorPriceUserProperty, trackPremiumFakeDoor } from "@/lib/amplitude";
import { isKoreanLocale } from "@/lib/i18n";
import { profileQuery } from "@/lib/profileQueries";
import { showCtaToast } from "@/lib/toast";
import { hasTokenSource } from "@/lib/userId";

import { PremiumEntryCard } from "./PremiumEntryCard";
import { PremiumFakeDoorFlow } from "./PremiumFakeDoorFlow";
import { assignPremiumPrice, canShowPremiumCard, PREMIUM_PLACEMENT } from "./premiumFakeDoor";
import { loadPremiumRecord, updatePremiumRecord } from "./premiumFakeDoorStore";

/**
 * 결과 화면의 프리미엄 사전 신청 카드와 신청 화면
 *
 * 홈에는 카드를 두지 않는다. 자리 값은 늘 `RESULT`다.
 * 노출 여부는 마운트할 때 한 번 정한다. 닫거나 신청하면 카드만 내리고, 열린 신청 화면은 완료까지 남는다.
 * 닫았다는 토스트는 결과 화면 아래 버튼 위의 `CtaToaster`로 보낸다.
 */
export function PremiumFakeDoorHost({ userId }: { userId: number }) {
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
      })
    );
  });
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const profile = useQuery({ ...profileQuery(userId), enabled: open });

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
            updatePremiumRecord(userId, { dismissed: true });
            trackPremiumFakeDoor("dismissed", base);
            setVisible(false);
            showCtaToast(t("card.dismissed"));
          }}
        />
      )}
      {open && (
        <PremiumFakeDoorFlow
          price={price}
          placement={placement}
          priceLabel={priceLabel}
          nickname={profile.data?.nickname ?? null}
          onApplied={() => {
            updatePremiumRecord(userId, { applied: true });
            setVisible(false);
          }}
          onClose={() => {
            setOpen(false);
            openRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
