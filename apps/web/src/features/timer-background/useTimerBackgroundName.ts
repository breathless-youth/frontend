import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { spaceCatalogQuery } from "./spaceCatalogQuery";
import { readTimerBackground } from "./timerBackground";
import { timerBackgroundPhotosQuery } from "./timerBackgroundQueries";

/**
 * 설정 행에 보일 지금 타이머 배경 이름
 *
 * 공간 페이지의 이름과 같다. 고른 사진이 지워졌거나 아직 못 읽었으면 심플로 보인다(세션 화면도 지운 사진은 심플로 그린다).
 * 서버 공간은 가진 공간 목록에서 이름을 찾고, 목록을 받기 전이나 목록에 없으면 비워 둔다.
 */
export function useTimerBackgroundName(userId: number | null): string {
  const { t } = useTranslation("study-session");
  const selection = readTimerBackground();
  const photos = useQuery({ ...timerBackgroundPhotosQuery(), enabled: selection.kind === "photo" });
  const catalog = useQuery({
    ...spaceCatalogQuery(userId ?? 0),
    enabled: selection.kind === "space" && userId !== null,
  });
  if (selection.kind === "space") {
    return catalog.data?.find((space) => space.selection.itemId === selection.itemId)?.name ?? "";
  }
  const index =
    selection.kind === "photo"
      ? (photos.data ?? []).findIndex((photo) => photo.id === selection.photoId)
      : -1;
  return index < 0 ? t("space.names.simple") : t("space.names.photo", { number: index + 1 });
}
