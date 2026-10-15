import type { TimelapseAspect } from "./timelapseSettings";

/**
 * 타임랩스 사진 한 장을 만드는 규칙
 *
 * 비전 워커와 메인 스레드 예비 경로가 같은 함수로 같은 사진을 만든다.
 * 카메라 원본 그대로 두어야 책과 노트 글자가 바르게 보여 좌우를 뒤집지 않는다.
 * 계산은 캔버스 없이 테스트하고, 그리기와 압축은 캔버스를 주입받는다.
 */

/** 세션을 시작할 때의 설정에서 온 촬영 요청 */
export interface PhotoSpec {
  readonly aspect: TimelapseAspect;
  /** 얼굴 모델이 찾은 얼굴 하나에 스티커를 덮을지 */
  readonly mask: boolean;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Size {
  readonly x: number;
  readonly y: number;
}

/** 프레임 크기에 대한 0~1 좌표로, MediaPipe 얼굴 랜드마크가 이 모양이다. */
export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export const PHOTO_MAX_LONG_EDGE = 1280;
export const PHOTO_JPEG_QUALITY = 0.8;
export const STICKER_URL = "/timelapse/face-sticker.png";

/**
 * 랜드마크에는 머리카락과 귀가 없어 그 범위보다 크게 덮는다.
 * 스티커는 정사각형에 내접한 원이라 반지름이 범위 긴 변의 0.75배가 되어 가장 먼 모서리(긴 변의 약 0.71배)까지 들어온다.
 */
const STICKER_SCALE = 1.5;

const ASPECT_RATIO: Record<TimelapseAspect, number> = { "9:16": 9 / 16, "16:9": 16 / 9 };

/**
 * 영상 비율에 맞춘 가운데 자르기
 *
 * 휴대폰 방향이 아니라 카메라가 넘겨준 프레임 모양을 기준으로 자른다.
 * 웹뷰 카메라는 휴대폰을 세로로 들면 가로로 긴 프레임을 주고 기기마다 비율도 다르다.
 */
export function cropRect(frame: Size, aspect: TimelapseAspect): Rect {
  const ratio = ASPECT_RATIO[aspect];
  if (frame.width / frame.height > ratio) {
    const width = Math.round(frame.height * ratio);
    return { x: Math.round((frame.width - width) / 2), y: 0, width, height: frame.height };
  }
  const height = Math.round(frame.width / ratio);
  return { x: 0, y: Math.round((frame.height - height) / 2), width: frame.width, height };
}

/**
 * 저장할 사진 크기
 *
 * 자른 크기 그대로 쓰되 긴 변만 상한에 맞춘다.
 * 늘리면 화질은 그대로이고 용량만 커져 늘리지 않는다.
 */
export function outputSize(crop: Size): Size {
  const scale = Math.min(1, PHOTO_MAX_LONG_EDGE / Math.max(crop.width, crop.height));
  return { width: Math.round(crop.width * scale), height: Math.round(crop.height * scale) };
}

/**
 * 얼굴 랜드마크를 덮는 스티커 자리
 *
 * 랜드마크가 덮는 범위의 긴 쪽에 여유를 둔 정사각형을 얼굴 가운데에 둔다.
 * 프레임 밖으로 나가도 안쪽으로 밀지 않는다.
 * 밀면 원의 중심이 얼굴에서 벗어나 범위 모서리가 드러나고, 밖으로 나간 부분은 캔버스가 잘라낸다.
 */
export function stickerBox(landmarks: readonly NormalizedPoint[], frame: Size): Rect | null {
  if (landmarks.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const side = Math.round(
    Math.max((maxX - minX) * frame.width, (maxY - minY) * frame.height) * STICKER_SCALE,
  );
  return {
    x: Math.round(((minX + maxX) / 2) * frame.width - side / 2),
    y: Math.round(((minY + maxY) / 2) * frame.height - side / 2),
    width: side,
    height: side,
  };
}

export type PhotoContext = Pick<OffscreenCanvasRenderingContext2D, "drawImage">;

/**
 * 그리기와 압축에 쓰는 캔버스
 *
 * 워커는 OffscreenCanvas, 메인 스레드는 HTMLCanvasElement를 준다.
 */
export interface PhotoSurface {
  readonly context: PhotoContext;
  encode(): Promise<ArrayBuffer>;
}

export interface PhotoInput {
  readonly source: CanvasImageSource;
  readonly frame: Size;
  readonly spec: PhotoSpec;
  /** 얼굴 모델이 이 프레임에서 찾은 얼굴 하나이고, 모델이 돌지 않았거나 얼굴이 없으면 없다. */
  readonly landmarks?: readonly NormalizedPoint[];
}

export type RenderPhoto = (input: PhotoInput) => Promise<ArrayBuffer>;

async function fetchSticker(): Promise<CanvasImageSource> {
  const response = await fetch(STICKER_URL);
  if (!response.ok) {
    throw new Error(`스티커 응답 ${response.status}`);
  }
  return await createImageBitmap(await response.blob());
}

/**
 * 프레임 한 장을 잘라 JPEG로 만드는 함수
 *
 * 프레임은 첫 await 전에 그린다.
 * 메인 스레드 경로는 `<video>`를 그리므로 추론과 같은 동기 구간에서 그려야 스티커가 추론한 얼굴 위에 놓인다.
 * 스티커는 첫 가림 요청 때 한 번 받아 둔다.
 * 가리지 못한 얼굴 사진을 남기지 않도록 스티커를 받지 못하면 압축하지 않고 실패한다.
 */
export function createPhotoRenderer(
  newSurface: (size: Size) => PhotoSurface,
  loadSticker: () => Promise<CanvasImageSource> = fetchSticker,
): RenderPhoto {
  let sticker: Promise<CanvasImageSource> | null = null;

  function stickerImage(): Promise<CanvasImageSource> {
    // 실패한 promise를 들고 있으면 다음 사진도 같은 실패를 받는다.
    sticker ??= loadSticker().catch((error: unknown) => {
      sticker = null;
      throw error;
    });
    return sticker;
  }

  return async ({ source, frame, spec, landmarks }) => {
    const crop = cropRect(frame, spec.aspect);
    const size = outputSize(crop);
    const surface = newSurface(size);
    surface.context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      size.width,
      size.height,
    );
    const box = spec.mask && landmarks !== undefined ? stickerBox(landmarks, frame) : null;
    if (box !== null) {
      const image = await stickerImage();
      const scale = size.width / crop.width;
      surface.context.drawImage(
        image,
        (box.x - crop.x) * scale,
        (box.y - crop.y) * scale,
        box.width * scale,
        box.height * scale,
      );
    }
    return await surface.encode();
  };
}

/** 사진이 실패해도 함께 가는 추론 결과는 살려야 하는 자리에서 쓴다. */
export async function tryRenderPhoto(
  render: RenderPhoto,
  input: PhotoInput,
): Promise<ArrayBuffer | undefined> {
  try {
    return await render(input);
  } catch (error: unknown) {
    console.warn("[timelapse] 사진을 만들지 못했다", error);
    return undefined;
  }
}

/**
 * 워커용 캔버스
 *
 * iOS 웹뷰는 WebP를 요청하면 오류 없이 무거운 PNG를 줘서 JPEG만 쓴다.
 */
export function offscreenSurface(size: Size): PhotoSurface {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D 컨텍스트를 만들지 못했다");
  }
  return {
    context,
    encode: async () =>
      await (
        await canvas.convertToBlob({ type: "image/jpeg", quality: PHOTO_JPEG_QUALITY })
      ).arrayBuffer(),
  };
}

/** 메인 스레드 예비 경로용 캔버스 */
export function documentSurface(size: Size): PhotoSurface {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D 컨텍스트를 만들지 못했다");
  }
  return {
    context,
    encode: () =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob === null) {
              reject(new Error("JPEG로 압축하지 못했다"));
              return;
            }
            blob.arrayBuffer().then(resolve, reject);
          },
          "image/jpeg",
          PHOTO_JPEG_QUALITY,
        );
      }),
  };
}
