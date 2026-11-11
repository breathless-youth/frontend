import { useTranslation } from "react-i18next";

import book from "@/assets/points/mascot-book.png";
import camcorder from "@/assets/points/mascot-camcorder.png";
import lamp from "@/assets/points/mascot-lamp.png";
import padlock from "@/assets/points/mascot-padlock.png";
import pencil from "@/assets/points/mascot-pencil.png";
import planner from "@/assets/points/mascot-planner.png";
import stopwatch from "@/assets/points/mascot-stopwatch.png";
import { cn } from "@/lib/utils";

import type { MascotId } from "../../types";

const MASCOT_SRC: Record<MascotId, string> = {
  book,
  planner,
  pencil,
  stopwatch,
  lamp,
  padlock,
  camcorder,
};

/**
 * 마스코트 그림
 *
 * 잠긴 마스코트는 흑백으로 흐리게 그리고 낭독기에도 잠겼다고 읽힌다.
 * 옆에 이름을 함께 적는 곳은 `decorative`로 그림을 낭독기에서 뺀다.
 */
export function MascotImage({
  id,
  locked = false,
  size,
  decorative = false,
  className,
}: {
  id: MascotId;
  locked?: boolean;
  size: number;
  decorative?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("points");
  const name = t(`mascots.${id}`);
  return (
    <img
      src={MASCOT_SRC[id]}
      alt={decorative ? "" : t(locked ? "mascotImage.locked" : "mascotImage.unlocked", { name })}
      aria-hidden={decorative ? true : undefined}
      draggable={false}
      className={cn("shrink-0 object-contain", locked && "opacity-30 grayscale", className)}
      style={{ width: size, height: size }}
    />
  );
}
