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
 * 새로 열린 마스코트는 라우트가 서버 값에서 골라 `newlyUnlocked`로 넘긴다.
 * 받은 값은 이 화면이 떠 있는 동안 한 번만 축하 화면으로 보인다.
 * 바꾸기나 나중에로 축하 화면을 닫으면 `onCelebrated`로 알려 서버가 본 것으로 기억하게 한다.
 */
export function MascotCollectionScreen({
  data,
  balance,
  onSelect,
  onBack,
  newlyUnlocked,
  onCelebrated,
}: {
  data: ShopData;
  balance: number;
  onSelect: (id: MascotId) => Promise<void>;
  onBack: () => void;
  newlyUnlocked?: MascotId;
  onCelebrated?: () => void;
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
          onCelebrated?.();
          void onSelect(newlyUnlocked);
        }}
        onLater={() => {
          setCelebrated(true);
          onCelebrated?.();
        }}
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
