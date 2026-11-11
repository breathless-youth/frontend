import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import { CoinIcon } from "./CoinIcon";

const SIZES = {
  home: { coin: 19, box: "h-6.5 gap-0.75 pr-2.5 pl-1 text-xs" },
  screen: { coin: 22, box: "h-8 gap-1 pr-2.75 pl-1 text-sm" },
} as const;

const UNKNOWN = "–P";

/**
 * 잔액 알약
 *
 * 홈 머리말은 작게, 그 밖의 화면 오른쪽 위는 한 단계 크게 그린다.
 * 잔액을 받기 전이나 받지 못했을 때는 숫자 자리에 줄표를 둔다.
 * 누를 수 있으면 알약은 작게 두고 누르는 자리만 44px로 넓힌다.
 */
export function PointsBalancePill({
  size,
  balance,
  onPress,
}: {
  size: keyof typeof SIZES;
  balance: number | undefined;
  onPress?: () => void;
}) {
  const { t } = useTranslation("points");
  const text = balance === undefined ? UNKNOWN : formatPoints(balance);
  const label = balance === undefined ? t("balance.unknown") : t("balance.label", { amount: text });
  const className = cn(
    "relative inline-flex shrink-0 items-center rounded-full bg-muted font-bold text-foreground tabular-nums shadow-sb-card",
    SIZES[size].box,
  );
  const content = (
    <>
      <CoinIcon size={SIZES[size].coin} />
      <span aria-hidden={onPress ? true : undefined}>{text}</span>
    </>
  );
  if (onPress) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onPress}
        className={cn(className, "before:absolute before:-inset-x-1 before:-inset-y-2.5")}
      >
        {content}
      </button>
    );
  }
  return (
    <span role="img" aria-label={label} className={className}>
      {content}
    </span>
  );
}
