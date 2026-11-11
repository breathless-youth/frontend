import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import type { ChargePack, EarnToday, ShopItem } from "../../types";

/**
 * 모자란 만큼을 채우는 가장 작은 충전 묶음
 *
 * 어느 묶음으로도 못 채우면 가장 큰 묶음을 고른다.
 */
function suggestedPack(packs: ChargePack[], shortfall: number): ChargePack | undefined {
  return packs.find((pack) => pack.points + pack.bonus >= shortfall) ?? packs.at(-1);
}

/**
 * 포인트가 모자랄 때의 시트
 *
 * 광고·미션·충전 세 가지 길을 보여 준다.
 * 앱 밖 브라우저처럼 광고나 충전을 못 하는 곳은 그 처리기를 넘기지 않아 줄을 숨긴다.
 * 포인트 받기 탭이 없으면 미션 줄도 숨기고, 세 길이 모두 없으면 공부로 모으는 안내와 확인 버튼만 둔다.
 * 결제와 광고는 끝날 때까지 시간이 걸려서, 끝나기 전에는 두 버튼을 함께 막는다.
 * 비활성 표시는 다음 렌더에야 붙으므로 같은 순간의 두 번째 누름은 ref로 막는다.
 * 시트는 body로 나가므로 Soft Blue 테마를 시트에도 단다.
 */
export function InsufficientPointsSheet({
  open,
  item,
  balance,
  earn,
  packs,
  onWatchAd,
  onMissions,
  onCharge,
  onClose,
}: {
  open: boolean;
  item: ShopItem | null;
  balance: number;
  earn?: EarnToday;
  packs: ChargePack[];
  onWatchAd?: () => Promise<void> | void;
  onMissions?: () => void;
  onCharge?: (productId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useTranslation("points");
  const price = item?.acquire.type === "price" ? item.acquire.price : 0;
  const shortfall = Math.max(price - balance, 0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked =
    packs.find((pack) => pack.productId === pickedId) ?? suggestedPack(packs, shortfall);
  const adLeft = earn === undefined ? 0 : earn.ad.limit - earn.ad.watched;
  const noWays = onWatchAd === undefined && onMissions === undefined && onCharge === undefined;
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const runOnce = async (task: () => Promise<void> | void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Drawer open={open && item !== null} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="theme-soft-blue">
        <div className="flex flex-col gap-4 pt-4">
          <DrawerTitle className="text-lg font-bold break-keep">
            {t("insufficient.title", {
              name: item?.name ?? "",
              shortfall: formatPoints(shortfall),
            })}
          </DrawerTitle>
          {noWays && (
            <>
              <p className="text-[15px] break-keep text-muted-foreground">
                {t("insufficient.studyHint")}
              </p>
              <Button size="xl" className="w-full shadow-sb-cta" onClick={onClose}>
                {t("insufficient.ok")}
              </Button>
            </>
          )}
          {onWatchAd && earn && (
            <WayRow
              title={t("insufficient.ad", { reward: formatPoints(earn.ad.reward) })}
              hint={
                adLeft > 0
                  ? t("insufficient.adLeft", { count: adLeft })
                  : t("insufficient.adDone", { count: earn.ad.limit })
              }
              action={adLeft > 0 ? t("insufficient.watch") : t("insufficient.tomorrow")}
              highlighted={adLeft > 0}
              disabled={adLeft <= 0 || busy}
              onClick={() => void runOnce(onWatchAd)}
            />
          )}
          {onMissions && (
            <WayRow
              title={t("insufficient.missions")}
              hint={t("insufficient.missionsHint")}
              action={t("insufficient.missionsAction")}
              onClick={onMissions}
            />
          )}
          {onCharge && picked && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold">{t("insufficient.charge")}</span>
                <div className="grid grid-cols-3 gap-2">
                  {packs.map((pack) => {
                    const selected = pack.productId === picked.productId;
                    return (
                      <button
                        key={pack.productId}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPickedId(pack.productId)}
                        className={cn(
                          "flex min-h-11 min-w-0 flex-col items-center gap-0.5 rounded-lg border bg-muted px-1.5 py-3",
                          selected ? "border-2 border-primary" : "border-border",
                        )}
                      >
                        <span className="text-[15px] font-extrabold tabular-nums">
                          {formatPoints(pack.points)}
                        </span>
                        <span className="text-xs break-keep text-muted-foreground">
                          {pack.priceLabel ?? t("insufficient.pricePending")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button
                size="xl"
                className="w-full shadow-sb-cta"
                disabled={busy}
                onClick={() => void runOnce(() => onCharge(picked.productId))}
              >
                {t("insufficient.chargeAndBuy", { points: formatPoints(picked.points) })}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function WayRow({
  title,
  hint,
  action,
  highlighted = false,
  disabled = false,
  onClick,
}: {
  title: string;
  hint: string;
  action: string;
  highlighted?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg px-4 py-3 text-left disabled:opacity-60",
        highlighted ? "bg-brand-subtle" : "bg-bg-layer-2",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold break-keep">{title}</span>
        <span className="text-[13px] break-keep text-muted-foreground">{hint}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-bold",
          disabled ? "text-text-tertiary" : "text-primary",
        )}
      >
        {action}
      </span>
    </button>
  );
}
