import type { FaceSpot } from "@/features/study-session/vision/faceSpot";
import { faceBoundsOf, faceSpotOf } from "@/features/study-session/vision/faceSpot";

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
  /** 내 얼굴에 이모지를 덮을지 */
  readonly mask: boolean;
  /** 덮을 이모지 그림 주소이고, 워커는 설정 저장소를 읽을 수 없어 요청에 실어 보낸다. */
  readonly emojiUrl: string;
  /**
   * 얼굴을 놓친 프레임에 덮을 어림 자리
   *
   * 감지기가 사람이 보일 때만 사람 검출과 직전 얼굴 위치로 구해 싣는다.
   * 타임랩스는 공유되는 결과물이라 `visible`이 거짓이어도 덮는다.
   */
  readonly spot?: FaceSpot;
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
/**
 * 사진 JPEG 압축 품질
 *
 * 실제 사진을 품질별로 나란히 비교했을 때 0.5에서도 화질 차이가 눈에 띄지 않았고, 장당 크기는 0.8의 절반 가까이로 준다.
 */
export const PHOTO_JPEG_QUALITY = 0.5;

/**
 * 얼굴을 놓친 프레임의 어림 자리를 얼굴로 찾은 자리보다 크게 덮는 배율
 *
 * 어림 자리는 최대 2초 전 얼굴 틱에서 잰 위치를 사람 검출로 따라간 값이라 그사이 고개를 숙이거나 돌린 만큼 어긋난다.
 * 1.75배 자리는 얼굴 긴 변의 0.375배까지 어긋나도 덮고, 1.3배를 더하면 약 0.64배까지 덮는다.
 */
// ponytail: 초기값이라 실기기에서 고개를 숙이고 돌린 사진을 보고 조정한다.
export const ESTIMATE_SCALE = 1.3;

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
 * 이모지를 덮을 자리
 *
 * 같은 프레임에서 찾은 랜드마크가 있으면 그 자리를, 없으면 어림 자리를 더 크게 덮는다.
 * 이모지 크기는 `FaceSpot`처럼 프레임 폭 기준 정사각형이다.
 * 프레임 밖으로 나가도 안쪽으로 밀지 않는다.
 * 밀면 이모지 가운데가 얼굴에서 벗어나고, 밖으로 나간 부분은 캔버스가 잘라낸다.
 */
export function maskBox(
  frame: Size,
  landmarks: readonly NormalizedPoint[] | undefined,
  spot: Pick<FaceSpot, "x" | "y" | "size"> | undefined,
): Rect | null {
  const face = faceBoundsOf(landmarks);
  const area =
    face !== null
      ? faceSpotOf(face, frame.width / frame.height)
      : spot === undefined
        ? null
        : { x: spot.x, y: spot.y, size: spot.size * ESTIMATE_SCALE };
  if (area === null) {
    return null;
  }
  const side = Math.round(area.size * frame.width);
  return {
    x: Math.round(area.x * frame.width - side / 2),
    y: Math.round(area.y * frame.height - side / 2),
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

async function fetchImage(url: string): Promise<CanvasImageSource> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`이모지 응답 ${response.status}`);
  }
  return await createImageBitmap(await response.blob());
}

/**
 * 프레임 한 장을 잘라 JPEG로 만드는 함수
 *
 * 프레임은 첫 await 전에 그린다.
 * 메인 스레드 경로는 `<video>`를 그리므로 추론과 같은 동기 구간에서 그려야 이모지가 추론한 얼굴 위에 놓인다.
 * 렌더러는 문서가 살아 있는 동안 남아 세션마다 다른 이모지를 받을 수 있어 주소별로 한 번씩 받아 둔다.
 * 가리지 못한 얼굴 사진을 남기지 않도록 이모지를 받지 못하면 압축하지 않고 실패한다.
 */
export function createPhotoRenderer(
  newSurface: (size: Size) => PhotoSurface,
  loadImage: (url: string) => Promise<CanvasImageSource> = fetchImage,
): RenderPhoto {
  const images = new Map<string, Promise<CanvasImageSource>>();

  function emojiImage(url: string): Promise<CanvasImageSource> {
    let image = images.get(url);
    if (image === undefined) {
      // 실패한 promise를 들고 있으면 다음 사진도 같은 실패를 받는다.
      image = loadImage(url).catch((error: unknown) => {
        images.delete(url);
        throw error;
      });
      images.set(url, image);
    }
    return image;
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
    const box = spec.mask ? maskBox(frame, landmarks, spec.spot) : null;
    if (box !== null) {
      const image = await emojiImage(spec.emojiUrl);
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
