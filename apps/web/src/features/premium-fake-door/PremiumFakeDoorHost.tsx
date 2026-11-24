import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { setPremiumFakeDoorPriceUserProperty, trackPremiumFakeDoor } from "@/lib/amplitude";
import { isKoreanLocale } from "@/lib/i18n";
import { profileQuery } from "@/lib/profileQueries";
import { showCtaToast, showToast } from "@/lib/toast";
import { hasTokenSource } from "@/lib/userId";

import { PremiumEntryCard } from "./PremiumEntryCard";
import { PremiumFakeDoorFlow } from "./PremiumFakeDoorFlow";
import { assignPremiumPrice, canShowPremiumCard, type PremiumPlacement } from "./premiumFakeDoor";
import { loadPremiumRecord, updatePremiumRecord } from "./premiumFakeDoorStore";

/**
 * 프리미엄 사전 신청 카드와 신청 화면
 *
 * 노출 여부는 마운트할 때 한 번 정한다. 닫거나 신청하면 카드만 내리고, 열린 신청 화면은 완료까지 남는다.
 * 결과 화면은 아래 버튼 위에 토스트를 띄우는 `CtaToaster`가 있어 그쪽으로 보낸다.
 */
export function PremiumFakeDoorHost({
  placement,
  userId,
}: {
  placement: PremiumPlacement;
  userId: number;
}) {
  const { t } = useTranslation("premium-fake-door");
  const price = assignPremiumPrice(userId);
  const base = { price, placement };
  const [visible, setVisible] = useState(() => {
    const record = loadPremiumRecord(userId);
    return (
      record !== null &&
      canShowPremiumCard({
        placement,
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
    if (placement === "RESULT" && !record.shownOnResult) {
      updatePremiumRecord(userId, { shownOnResult: true });
    }
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
            (placement === "RESULT" ? showCtaToast : showToast)(t("card.dismissed"));
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
