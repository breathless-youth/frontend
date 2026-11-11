import {
  decode,
  encodeJpeg,
  MAX_SOURCE_BYTES,
  UnusablePhotoError,
} from "@/features/profile/prepareProfilePhoto";

import type { NewTimerBackgroundPhoto } from "./timerBackgroundPhotos";

/** 저장하는 사진의 긴 변. 휴대폰 화면을 덮고 남는 크기다. */
export const BACKGROUND_LONG_EDGE_PX = 1920;
const JPEG_QUALITY = 0.8;

/**
 * 배경으로 담을 사진 만들기
 *
 * 자르지 않고 긴 변을 1920px 이하로 줄인 JPEG로 만든다.
 * 크기·위치는 미리보기에서 사용자가 맞추므로 여기서는 비율만 지킨다.
 * 읽지 못했거나 너무 큰 사진은 사용자에게 같은 말로 안내하도록 모두 UnusablePhotoError로 던진다.
 */
export async function prepareBackgroundPhoto(file: File): Promise<NewTimerBackgroundPhoto> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new UnusablePhotoError();
  }
  try {
    // Android 웹뷰는 파일 선택기가 준 File을 바로 디코드하지 못하고, 같은 내용을 메모리로 옮긴 사본은 디코드한다.
    return await resizeToJpeg(
      new Blob([await file.arrayBuffer()], { type: file.type }),
      BACKGROUND_LONG_EDGE_PX,
    );
  } catch {
    throw new UnusablePhotoError();
  }
}

/**
 * 비율을 지킨 채 긴 변을 `longEdge` 이하로 줄인 JPEG
 *
 * 담을 사진과 선택 화면 타일의 작은 사진이 같이 쓴다.
 * 읽거나 만들지 못하면 throw한다.
 */
export async function resizeToJpeg(
  source: Blob,
  longEdge: number,
): Promise<NewTimerBackgroundPhoto> {
  const bitmap = await decode(source);
  const ratio = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  try {
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new UnusablePhotoError();
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  const blob = await encodeJpeg(canvas, JPEG_QUALITY);
  // 캔버스는 JPEG를 못 만들면 오류 없이 PNG를 준다. iOS 웹뷰는 JPEG만 믿을 만하게 만든다.
  if (blob?.type !== "image/jpeg") {
    throw new UnusablePhotoError();
  }
  return { bytes: await blob.arrayBuffer(), width: canvas.width, height: canvas.height };
}
