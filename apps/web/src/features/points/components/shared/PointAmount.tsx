import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import { CoinIcon } from "./CoinIcon";

const SIZES = {
  sm: { coin: 16, text: "text-[13px]" },
  md: { coin: 18, text: "text-sm" },
  lg: { coin: 22, text: "text-base" },
} as const;

/** 코인과 함께 쓰는 포인트 양 */
export function PointAmount({ value, size = "md" }: { value: number; size?: keyof typeof SIZES }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold tabular-nums", SIZES[size].text)}>
      <CoinIcon size={SIZES[size].coin} />
      {formatPoints(value)}
    </span>
  );
}
