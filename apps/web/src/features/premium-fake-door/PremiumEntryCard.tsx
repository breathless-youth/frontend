import { Sparkles, X } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";

/**
 * 프리미엄 사전 신청 진입 카드(시안 E1-b 카드)
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
      <span
        aria-hidden="true"
        className="pointer-events-none flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-primary"
      >
        <Sparkles size={22} strokeWidth={2} />
      </span>
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
