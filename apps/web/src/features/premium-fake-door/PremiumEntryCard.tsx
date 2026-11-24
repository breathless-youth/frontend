import { X } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import timiSparta from "@/assets/mascot/timi-sparta.png";
import { Card } from "@/components/ui/card";

/**
 * 스파르타 기능 사전 신청 진입 카드(시안 E1-b 카드)
 *
 * 카드 전체가 여는 버튼이고 오른쪽 위 X만 따로 닫는다. 둘 다 44px 이상이다.
 */
export function PremiumEntryCard({
  priceLabel,
  onOpen,
  onDismiss,
  openRef,
}: {
  priceLabel: string;
  onOpen: () => void;
  onDismiss: () => void;
  openRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation("premium-fake-door");
  return (
    <Card className="relative flex min-h-18 items-center gap-3 rounded-lg py-3.5 pr-12 pl-3.5">
      <button
        ref={openRef}
        type="button"
        aria-label={t("card.open")}
        onClick={onOpen}
        className="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      />
      {/* 혜택 화면 머리의 스파르타 티미와 같은 그림이라 카드와 신청 화면이 한 묶음으로 읽힌다. 꾸밈이라 alt를 비운다. */}
      <img
        src={timiSparta}
        alt=""
        width={44}
        height={44}
        draggable={false}
        className="pointer-events-none size-11 shrink-0 select-none"
      />
      <span className="pointer-events-none min-w-0">
        <span className="block text-[15px] leading-5.25 font-semibold tracking-[-0.02em]">
          {t("card.title")}
        </span>
        <span className="block text-[13px] text-muted-foreground tabular-nums">
          {t("card.summary", { price: priceLabel })}
        </span>
      </span>
      <button
        type="button"
        aria-label={t("card.dismiss")}
        onClick={onDismiss}
        className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-lg text-text-tertiary focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        <X size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </Card>
  );
}
