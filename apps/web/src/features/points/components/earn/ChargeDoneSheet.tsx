import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

import { formatPoints, formatSignedPoints } from "../../model/formatPoints";

export type ChargeDone = { granted: number; bonus: number; balance: number; image: string };

/** 충전이 끝난 뒤의 결과 시트이며 충전·보너스·보유 포인트를 표로 보인다. */
export function ChargeDoneSheet({
  done,
  onClose,
  onShop,
}: {
  done: ChargeDone | null;
  onClose: () => void;
  onShop: () => void;
}) {
  const { t } = useTranslation("points-earn");
  return (
    <Drawer open={done !== null} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="theme-soft-blue">
        {done !== null && (
          <div className="flex flex-col gap-2.5 pt-4">
            <img
              src={done.image}
              alt=""
              aria-hidden
              draggable={false}
              className="size-24 self-center"
            />
            <DrawerTitle className="text-center text-xl font-extrabold">
              {t("done.title")}
            </DrawerTitle>
            <p className="mb-1 text-center text-[28px] font-extrabold text-primary tabular-nums">
              {formatSignedPoints(done.granted + done.bonus)}
            </p>
            <dl className="flex flex-col rounded-lg bg-bg-layer-2 px-3.5 py-2.5 text-sm">
              <Line label={t("done.points")} value={formatPoints(done.granted)} />
              <Line label={t("done.bonus")} value={formatSignedPoints(done.bonus)} />
              <div className="my-1.5 h-px bg-border" />
              <Line label={t("done.balance")} value={formatPoints(done.balance)} strong />
            </dl>
            <div className="mt-1.5 flex gap-2">
              <Button variant="secondary" size="xl" className="flex-1" onClick={onClose}>
                {t("done.close")}
              </Button>
              <Button size="xl" className="flex-[1.4]" onClick={onShop}>
                {t("done.shop")}
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-extrabold tabular-nums" : "font-semibold tabular-nums"}>
        {value}
      </dd>
    </div>
  );
}
