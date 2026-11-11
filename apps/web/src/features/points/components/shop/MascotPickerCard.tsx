import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { pointsKeys } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../../gateway/PointsGatewayContext";
import type { MascotId, Mascot } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/**
 * 오늘 함께할 마스코트 고르기
 *
 * 마스코트를 다 모은 뒤 다음 마스코트 카드 자리에 놓인다.
 * 고른 값은 경계에 저장하고 상점 데이터를 다시 받아 선택 표시를 바꾼다.
 */
export function MascotPickerCard({ mascots }: { mascots: Mascot[] }) {
  const { t } = useTranslation(["points-shop", "points"]);
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const queryClient = useQueryClient();
  const select = useMutation({
    mutationFn: (id: MascotId) => gateway.selectMascot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) }),
  });
  return (
    <section
      aria-label={t("points-shop:picker.label")}
      className="flex flex-col gap-2 rounded-lg bg-muted px-4 py-3 shadow-sb-card"
    >
      <h2 className="text-[15px] font-bold">{t("points-shop:picker.title")}</h2>
      <div className="flex justify-between">
        {mascots.map((mascot) => (
          <button
            key={mascot.id}
            type="button"
            aria-pressed={mascot.selected}
            aria-label={t(`points:mascots.${mascot.id}`)}
            onClick={() => select.mutate(mascot.id)}
            className={cn(
              "flex size-11 items-center justify-center rounded-2xl",
              mascot.selected && "bg-brand-subtle ring-2 ring-primary",
            )}
          >
            <MascotImage id={mascot.id} size={36} decorative />
          </button>
        ))}
      </div>
    </section>
  );
}
