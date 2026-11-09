import { queryOptions } from "@tanstack/react-query";

import { jpegDataUrl } from "@/lib/jpegDataUrl";

import type { PhotoFit } from "./photoFit";
import { timerBackgroundPhotoStore, type TimerBackgroundPhoto } from "./timerBackgroundPhotos";

/** 화면에 그릴 배경 사진. 바이트 대신 data URL을 든다. */
export interface BackgroundPhotoView {
  id: string;
  width: number;
  height: number;
  fit: PhotoFit;
  src: string;
}

export async function toPhotoView(photo: TimerBackgroundPhoto): Promise<BackgroundPhotoView> {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    fit: photo.fit,
    src: await jpegDataUrl(photo.bytes),
  };
}

export const TIMER_BACKGROUND_PHOTOS_KEY = ["timer-background", "photos"] as const;

/** 담은 사진 목록. 이 기기 안에서만 바뀌고 바꾸는 쪽이 무효화하므로 다시 읽지 않는다. */
export function timerBackgroundPhotosQuery() {
  return queryOptions({
    queryKey: TIMER_BACKGROUND_PHOTOS_KEY,
    queryFn: async () => Promise.all((await timerBackgroundPhotoStore().list()).map(toPhotoView)),
    staleTime: Infinity,
  });
}
