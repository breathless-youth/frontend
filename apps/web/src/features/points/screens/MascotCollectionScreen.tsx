import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/features/records/recordsFormat";

import { LockedMascotSheet } from "../components/mascots/LockedMascotSheet";
import { MascotGrid } from "../components/mascots/MascotGrid";
import { MascotUnlockedScreen } from "../components/mascots/MascotUnlockedScreen";
import { PointsScreenFrame } from "../components/shared/PointsScreenFrame";
import type { Mascot, MascotId, ShopData } from "../types";

/**
 * 마스코트 모으기 화면
 *
 * 새로 열린 마스코트를 이미 보여 줬는지는 서버가 모르므로 `newlyUnlocked`로 받는다.
 * 받은 값은 이 화면이 떠 있는 동안 한 번만 축하 화면으로 보이고, 나중에를 누르면 다시 보이지 않는다.
 */
export function MascotCollectionScreen({
  data,
  balance,
  onSelect,
  onBack,
  newlyUnlocked,
}: {
  data: ShopData;
  balance: number;
  onSelect: (id: MascotId) => Promise<void>;
  onBack: () => void;
  newlyUnlocked?: MascotId;
}) {
  const { t } = useTranslation("points");
  const { t: tMascots } = useTranslation("points-mascots");
  const [pressed, setPressed] = useState<Mascot | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const mascots = [...data.mascots].sort((a, b) => a.unlockFocusSec - b.unlockFocusSec);
  const nextId = mascots.find((mascot) => !mascot.unlocked)?.id;

  if (newlyUnlocked !== undefined && !celebrated) {
    return (
      <MascotUnlockedScreen
        mascotId={newlyUnlocked}
        onSwitch={() => {
          setCelebrated(true);
          void onSelect(newlyUnlocked);
        }}
        onLater={() => setCelebrated(true)}
      />
    );
  }

  return (
    <PointsScreenFrame title={t("titles.mascots")} onBack={onBack} balance={balance}>
      <div className="flex flex-col gap-3.5 pt-1.5">
        <section className="flex flex-col gap-0.5 rounded-xl bg-muted px-4 py-3.5 shadow-sb-card">
          <span className="text-[13px] text-muted-foreground">{tMascots("totalFocus")}</span>
          <span className="text-xl font-extrabold tabular-nums">
            {formatDuration(data.totalFocusSec)}
          </span>
        </section>
        <MascotGrid
          mascots={mascots}
          totalFocusSec={data.totalFocusSec}
          onSelect={(id) => void onSelect(id)}
          onLockedPress={setPressed}
        />
      </div>
      <LockedMascotSheet
        mascot={pressed}
        hidden={pressed !== null && pressed.id !== nextId}
        totalFocusSec={data.totalFocusSec}
        onClose={() => setPressed(null)}
      />
    </PointsScreenFrame>
  );
}
