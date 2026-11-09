import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { readTimerBackground } from "./timerBackground";
import { timerBackgroundPhotosQuery } from "./timerBackgroundQueries";

/**
 * 설정 행에 보일 지금 타이머 배경 이름
 *
 * 고른 사진이 지워졌거나 아직 못 읽었으면 심플로 보인다. 세션 화면도 지운 사진은 심플로 본다.
 */
export function useTimerBackgroundName(): string {
  const { t } = useTranslation("settings");
  const selection = readTimerBackground();
  const photos = useQuery(timerBackgroundPhotosQuery());
  const index =
    selection.kind === "photo"
      ? (photos.data ?? []).findIndex((photo) => photo.id === selection.photoId)
      : -1;
  return index < 0
    ? t("timerBackground.simple")
    : t("timerBackground.photoName", { number: index + 1 });
}
