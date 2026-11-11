import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { formatDuration } from "@/features/records/recordsFormat";

import type { Mascot } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/**
 * 잠긴 마스코트를 눌렀을 때 남은 시간을 알리는 시트
 *
 * 시트는 body로 나가므로 Soft Blue 테마를 시트에도 단다.
 * 숨긴 이름은 시트에서도 그대로 숨긴다.
 */
export function LockedMascotSheet({
  mascot,
  hidden,
  totalFocusSec,
  onClose,
}: {
  mascot: Mascot | null;
  hidden: boolean;
  totalFocusSec: number;
  onClose: () => void;
}) {
  const { t } = useTranslation("points-mascots");
  const { t: tPoints } = useTranslation("points");
  const name = mascot === null ? "" : hidden ? t("hiddenName") : tPoints(`mascots.${mascot.id}`);
  const target = mascot?.unlockFocusSec ?? 0;
  const percent = target === 0 ? 100 : Math.min(Math.floor((totalFocusSec / target) * 100), 100);
  return (
    <Drawer open={mascot !== null} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="theme-soft-blue">
        {mascot !== null && (
          <div className="flex flex-col gap-2.5 pt-4">
            <MascotImage id={mascot.id} locked size={110} decorative className="self-center" />
            <DrawerTitle className="text-center text-xl font-extrabold">{name}</DrawerTitle>
            <p className="text-center text-sm text-muted-foreground">
              {t("sheet.untilOpen", { time: formatDuration(Math.max(target - totalFocusSec, 0)) })}
            </p>
            <div
              role="img"
              aria-label={t("sheet.progress", { name, percent })}
              className="h-2 overflow-hidden rounded-full bg-bg-layer-2"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{formatDuration(totalFocusSec)}</span>
              <span>{formatDuration(target)}</span>
            </div>
            <Button size="xl" className="mt-1 w-full" onClick={onClose}>
              {t("sheet.close")}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
