import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints, formatSignedPoints } from "../../model/formatPoints";
import type { ChargePack } from "../../types";
import { packImage } from "./packImage";

/**
 * 포인트 충전 묶음 칸
 *
 * 스토어에서 가격을 받지 못한 묶음은 결제 창을 열어도 실패하므로 가격 확인 중으로 두고 누를 수 없게 한다.
 */
export function ChargePackGrid({
  packs,
  pending,
  onCharge,
}: {
  packs: ChargePack[];
  pending: boolean;
  onCharge: (pack: ChargePack) => void;
}) {
  const { t } = useTranslation("points-earn");
  return (
    <div className="grid grid-cols-3 gap-2">
      {packs.map((pack, index) => (
        <button
          key={pack.productId}
          type="button"
          disabled={pending || pack.priceLabel === null}
          aria-label={`${t("charge.packLabel", { points: formatPoints(pack.points) })}${pack.priceLabel === null ? "" : `, ${pack.priceLabel}`}`}
          onClick={() => onCharge(pack)}
          className={cn(
            "relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg bg-bg-layer-2 px-2 pt-1.5 pb-2 disabled:opacity-60",
            pack.popular && "shadow-[inset_0_0_0_2px_var(--primary)]",
          )}
        >
          {pack.popular && (
            <span className="absolute -top-2.25 rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold text-primary-foreground">
              {t("charge.popular")}
            </span>
          )}
          <img src={packImage(index)} alt="" aria-hidden draggable={false} className="size-19" />
          <span className="text-base font-extrabold tabular-nums">{formatPoints(pack.points)}</span>
          <span className="h-4 text-xs font-semibold text-feedback-success">
            {pack.bonus > 0 && t("charge.bonus", { points: formatSignedPoints(pack.bonus) })}
          </span>
          <span
            className={cn(
              "mt-1 flex min-h-11 w-full items-center justify-center rounded-md bg-muted px-1 text-[13px] font-bold break-keep",
              pack.priceLabel === null ? "text-muted-foreground" : "text-primary",
            )}
          >
            {pack.priceLabel ?? t("charge.pricePending")}
          </span>
        </button>
      ))}
    </div>
  );
}
