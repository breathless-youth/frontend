import { queryOptions } from "@tanstack/react-query";

import { jpegDataUrl } from "@/lib/jpegDataUrl";

import type { PhotoFit } from "./photoFit";
import { resizeToJpeg } from "./prepareBackgroundPhoto";
import { timerBackgroundPhotoStore, type TimerBackgroundPhoto } from "./timerBackgroundPhotos";

/** 선택 화면 타일에 쓰는 작은 사진의 긴 변. 타일은 3배 밀도 화면에서 약 330px로 그려진다. */
const TILE_LONG_EDGE_PX = 360;

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

/** 선택 화면 타일에 그릴 사진. 원본 대신 작게 줄인 그림을 든다. */
export interface BackgroundPhotoTile {
  id: string;
  fit: PhotoFit;
  thumb: string;
}

// 원본을 data URL로 들고 있으면 저사양 웹뷰에서 사진마다 수백 KB가 메모리에 남아 타일에는 줄인 그림만 둔다.
async function toPhotoTile(photo: TimerBackgroundPhoto): Promise<BackgroundPhotoTile> {
  let thumb: string;
  try {
    const small = await resizeToJpeg(
      new Blob([photo.bytes], { type: "image/jpeg" }),
      TILE_LONG_EDGE_PX,
    );
    thumb = await jpegDataUrl(small.bytes);
  } catch {
    thumb = await jpegDataUrl(photo.bytes);
  }
  return { id: photo.id, fit: photo.fit, thumb };
}

export const TIMER_BACKGROUND_PHOTOS_KEY = ["timer-background", "photos"] as const;

/** 담은 사진 목록. 이 기기 안에서만 바뀌고 바꾸는 쪽이 무효화하므로 다시 읽지 않는다. */
export function timerBackgroundPhotosQuery() {
  return queryOptions({
    queryKey: TIMER_BACKGROUND_PHOTOS_KEY,
    queryFn: async () => Promise.all((await timerBackgroundPhotoStore().list()).map(toPhotoTile)),
    staleTime: Infinity,
  });
}

/** 미리보기에 까는 사진 한 장. 원본이 필요해 그 사진만 따로 읽는다. 목록 키 아래라 목록을 무효화하면 같이 다시 읽는다. */
export function timerBackgroundPhotoQuery(id: string | null) {
  return queryOptions({
    queryKey: [...TIMER_BACKGROUND_PHOTOS_KEY, id],
    queryFn: async () => {
      const photo = id === null ? null : await timerBackgroundPhotoStore().get(id);
      return photo === null ? null : toPhotoView(photo);
    },
    enabled: id !== null,
    staleTime: Infinity,
  });
}
