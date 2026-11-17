import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPointCount, formatPoints, formatSignedPoints } from "../../model/formatPoints";
import { useCountUp } from "../../model/useCountUp";
import { CoinIcon } from "./CoinIcon";

const SIZES = {
  home: { coin: 19, box: "h-6.5 gap-0.75 pr-2.5 pl-1 text-xs" },
  screen: { coin: 22, box: "h-8 gap-1 pr-2.75 pl-1 text-sm" },
} as const;

const UNKNOWN = "–P";

/** 받은 포인트 배지와 테두리를 보이는 시간이며 index.css의 points-gain 키프레임 길이와 같다. */
const GAIN_SHOWN_MS = 2000;

/** 방금 받은 포인트이며 같은 금액을 연달아 받아도 번호로 구분한다. */
export type PointsGain = { points: number; id: number };

/**
 * 방금 받은 포인트를 잠깐만 보이기
 *
 * 새 번호가 오면 처음부터 다시 세고, 시간이 지난 번호는 다시 그려져도 보이지 않는다.
 */
function useShownGain(gain: PointsGain | null | undefined): PointsGain | null {
  const [expired, setExpired] = useState<number | null>(null);
  const id = gain?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = window.setTimeout(() => setExpired(id), GAIN_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [id]);
  return gain && gain.id !== expired ? gain : null;
}

/**
 * 잔액 알약
 *
 * 홈 머리말은 작게, 그 밖의 화면 오른쪽 위는 한 단계 크게 그린다.
 * 잔액을 받기 전이나 받지 못했을 때는 숫자 자리에 줄표를 둔다.
 * 누를 수 있으면 알약은 작게 두고 누르는 자리만 44px로 넓힌다.
 * 잔액이 늘면 숫자를 세어 올리고, 읽어 주는 이름에는 처음부터 새 잔액을 쓴다.
 * 받은 포인트를 넘기면 받은 금액 배지와 테두리를 잠깐 보이고, 움직임 줄이기에서는 배지만 움직이지 않고 보인다.
 */
export function PointsBalancePill({
  size,
  balance,
  onPress,
  gain,
}: {
  size: keyof typeof SIZES;
  balance: number | undefined;
  onPress?: () => void;
  /** 방금 받은 포인트이며 넘기는 화면에만 낭독기 알림 자리를 만든다. */
  gain?: PointsGain | null;
}) {
  const { t } = useTranslation("points");
  const shown = useCountUp(balance);
  const shownGain = useShownGain(gain);
  const text = shown === undefined ? UNKNOWN : formatPoints(shown);
  const label =
    balance === undefined
      ? t("balance.unknown")
      : t("balance.label", { amount: formatPoints(balance) });
  const className = cn(
    "relative inline-flex shrink-0 items-center rounded-full bg-muted font-bold text-foreground tabular-nums shadow-sb-card",
    SIZES[size].box,
    // 알약 그림자가 따로 정한 box-shadow라 테두리는 겹쳐 그린 층에 둔다.
    shownGain !== null &&
      "after:pointer-events-none after:absolute after:inset-0 after:animate-[points-gain-ring_2s_ease-out_both] after:rounded-full after:ring-2 after:ring-primary motion-reduce:after:hidden",
  );
  const gained = shownGain !== null ? "" : undefined;
  const content = (
    <>
      <CoinIcon size={SIZES[size].coin} />
      <span aria-hidden={onPress ? true : undefined}>{text}</span>
    </>
  );
  const pill = onPress ? (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      data-gained={gained}
      className={cn(className, "before:absolute before:-inset-x-1 before:-inset-y-2.5")}
    >
      {content}
    </button>
  ) : (
    <span role="img" aria-label={label} data-gained={gained} className={className}>
      {content}
    </span>
  );
  if (gain === undefined) return pill;
  return (
    <span className="relative inline-flex">
      {/* 낭독기는 알림 자리에 새로 들어온 글만 읽으므로 자리는 처음부터 두고 받을 때만 글을 채운다. */}
      <span role="status" aria-live="polite" className="sr-only">
        {shownGain !== null &&
          t("balance.gained", {
            count: shownGain.points,
            amount: formatPointCount(shownGain.points),
          })}
      </span>
      {shownGain !== null && (
        <span
          key={shownGain.id}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-full mb-1 animate-[points-gain-badge_2s_ease-out_both] rounded-full bg-primary-deep px-1.75 py-0.5 text-[11px] leading-3.5 font-extrabold whitespace-nowrap text-primary-foreground tabular-nums motion-reduce:animate-none"
        >
          {formatSignedPoints(shownGain.points)}
        </span>
      )}
      {pill}
    </span>
  );
}
