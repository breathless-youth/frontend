import { useTranslation } from "react-i18next";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";

import type { MascotId } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/**
 * 새 마스코트가 열렸을 때의 축하 화면
 *
 * 뒤로 가기는 나중에와 같다.
 */
export function MascotUnlockedScreen({
  mascotId,
  onSwitch,
  onLater,
}: {
  mascotId: MascotId;
  onSwitch: () => void;
  onLater: () => void;
}) {
  const { t } = useTranslation("points-mascots");
  const { t: tPoints } = useTranslation("points");
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader onBack={onLater} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
        <span className="text-sm font-bold text-state-pause">{t("unlocked.tag")}</span>
        <MascotImage id={mascotId} size={190} />
        <h1 className="text-[26px] font-extrabold">{tPoints(`mascots.${mascotId}`)}</h1>
      </div>
      <div className="flex flex-col gap-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <Button size="xl" className="w-full" onClick={onSwitch}>
          {t("unlocked.switch")}
        </Button>
        <Button size="xl" variant="secondary" className="w-full" onClick={onLater}>
          {t("unlocked.later")}
        </Button>
      </div>
    </main>
  );
}
