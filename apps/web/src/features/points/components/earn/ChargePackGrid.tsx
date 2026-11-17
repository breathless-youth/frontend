import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import type { ChargePack } from "../../types";
import { packImage } from "./packImage";

/**
 * 포인트 충전 묶음 칸
 *
 * 스토어에서 가격을 받지 못한 묶음은 결제 창을 열어도 실패하므로 가격 확인 중으로 두고 누를 수 없게 한다.
 * 비회원은 앱에 가격을 묻지 않아서 가격 자리에 로그인 안내를 두고, 누르면 받기 탭의 회원 문이 로그인 화면으로 보낸다.
 * 화면에 보너스라는 말을 쓰지 않아서 묶음 포인트와 가격만 보인다.
 */
export function ChargePackGrid({
  packs,
  pending,
  member = true,
  onCharge,
}: {
  packs: ChargePack[];
  pending: boolean;
  member?: boolean;
  onCharge: (pack: ChargePack) => void;
}) {
  const { t } = useTranslation(["points-earn", "settings"]);
  return (
    <div className="grid grid-cols-3 gap-2">
      {packs.map((pack, index) => {
        const price = member ? pack.priceLabel : t("settings:rows.login");
        return (
          <button
            key={pack.productId}
            type="button"
            disabled={pending || price === null}
            aria-label={`${t("points-earn:charge.packLabel", { points: formatPoints(pack.points) })}${price === null ? "" : `, ${price}`}`}
            onClick={() => onCharge(pack)}
            className="relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg bg-bg-layer-2 px-2 pt-1.5 pb-2 disabled:opacity-60"
          >
            <img src={packImage(index)} alt="" aria-hidden draggable={false} className="size-19" />
            <span className="text-base font-extrabold tabular-nums">
              {formatPoints(pack.points)}
            </span>
            <span
              className={cn(
                "mt-1 flex min-h-11 w-full items-center justify-center rounded-md bg-muted px-1 text-[13px] font-bold break-keep",
                price === null ? "text-muted-foreground" : "text-primary",
              )}
            >
              {price ?? t("points-earn:charge.pricePending")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
