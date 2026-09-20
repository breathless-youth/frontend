import type { EyeOutline } from "../faceLandmarker";

/**
 * 눈 자리를 카메라 프리뷰 위에 그리는 오버레이 — 측정이 끝나면 폴더와 함께 지운다.
 *
 * 좌표는 여기서 캔버스에 그려지고 끝난다. 저장하지도, 진단이나 덩어리에 싣지도 않는다.
 * 그래서 이 파일은 좌표를 받되 **밖으로 내보내는 함수가 없다.** 캔버스에는 카메라 프리뷰와
 * 같은 세션 리플레이 차단 표식을 붙인다 — 눈 위치도 얼굴에서 나온 측정치다.
 *
 * 프리뷰 `<video>`는 화면을 `object-fit`으로 채우므로 정규화 좌표를 그대로 픽셀에 곱하면
 * 어긋난다. 잘린 여백을 계산해 같은 자리에 놓고, 전면 카메라의 거울 표시도 따라 뒤집는다.
 */

export interface OverlayGeometry {
  /** 프리뷰 요소의 화면 크기. */
  readonly rectWidth: number;
  readonly rectHeight: number;
  /** 카메라 스트림의 실제 크기. */
  readonly videoWidth: number;
  readonly videoHeight: number;
  /** 전면 카메라처럼 좌우가 뒤집혀 표시되는가. */
  readonly mirrored: boolean;
  readonly fit: "cover" | "contain";
}

/** 정규화 좌표 하나를 프리뷰 요소 안의 픽셀 위치로. `cover`는 가운데 맞춤, `contain`은 위 맞춤이다. */
export function projectPoint(
  point: { readonly x: number; readonly y: number },
  geometry: OverlayGeometry,
): { x: number; y: number } {
  const { rectWidth, rectHeight, videoWidth, videoHeight, mirrored, fit } = geometry;
  if (videoWidth === 0 || videoHeight === 0) {
    return { x: 0, y: 0 };
  }
  const scaleX = rectWidth / videoWidth;
  const scaleY = rectHeight / videoHeight;
  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const drawnWidth = videoWidth * scale;
  const drawnHeight = videoHeight * scale;
  const offsetX = (rectWidth - drawnWidth) / 2;
  // contain은 프리뷰가 object-top이라 위에 붙는다.
  const offsetY = fit === "cover" ? (rectHeight - drawnHeight) / 2 : 0;
  const x = mirrored ? 1 - point.x : point.x;
  return { x: offsetX + x * drawnWidth, y: offsetY + point.y * drawnHeight };
}

export interface EyeOverlayOptions {
  readonly enabled: boolean;
  readonly fit: "cover" | "contain";
  readonly doc?: Document | undefined;
}

export interface EyeOverlay {
  /** 얼굴 틱마다 부른다. null이면 그림을 지운다. */
  draw(outline: EyeOutline | null): void;
  destroy(): void;
}

const ACCEPTED_COLOR = "#3ddc84";
const SKIPPED_COLOR = "#ffb020";

/** 전면 카메라 프리뷰가 쓰는 거울 클래스. `CameraPreviewSurface.tsx`와 같은 값이어야 한다. */
const MIRROR_CLASS = "scale-x-[-1]";

export function createEyeOverlay(options: EyeOverlayOptions): EyeOverlay {
  const { enabled, fit } = options;
  const doc = options.doc ?? globalThis.document;
  let canvas: HTMLCanvasElement | null = null;

  function findVideo(): HTMLVideoElement | null {
    if (doc === undefined) {
      return null;
    }
    return (
      doc.querySelector<HTMLVideoElement>('[data-session-surface="camera"] video') ??
      doc.querySelector<HTMLVideoElement>("video")
    );
  }

  function ensureCanvas(): HTMLCanvasElement | null {
    if (doc === undefined) {
      return null;
    }
    if (canvas !== null) {
      return canvas;
    }
    canvas = doc.createElement("canvas");
    canvas.setAttribute("data-measure-eye-overlay", "");
    // 눈 위치도 얼굴에서 나온 값이다. 프리뷰와 같은 표식으로 세션 리플레이에서 뺀다.
    canvas.className = "amp-block sentry-block";
    canvas.style.cssText = [
      "position:fixed",
      "pointer-events:none",
      // 패널(40)보다 아래, 프리뷰보다 위.
      "z-index:30",
    ].join(";");
    doc.body.append(canvas);
    return canvas;
  }

  function clear(): void {
    if (canvas === null) {
      return;
    }
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  return {
    draw(outline) {
      if (!enabled) {
        return;
      }
      const video = findVideo();
      if (video === null || outline === null) {
        clear();
        return;
      }
      const target = ensureCanvas();
      if (target === null) {
        return;
      }
      const rect = video.getBoundingClientRect();
      const ratio = globalThis.devicePixelRatio || 1;
      target.style.left = `${rect.left}px`;
      target.style.top = `${rect.top}px`;
      target.style.width = `${rect.width}px`;
      target.style.height = `${rect.height}px`;
      target.width = Math.max(1, Math.round(rect.width * ratio));
      target.height = Math.max(1, Math.round(rect.height * ratio));
      const context = target.getContext("2d");
      if (context === null) {
        return;
      }
      const geometry: OverlayGeometry = {
        rectWidth: rect.width,
        rectHeight: rect.height,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        mirrored: video.classList.contains(MIRROR_CLASS),
        fit,
      };
      context.clearRect(0, 0, target.width, target.height);
      context.scale(ratio, ratio);
      context.lineWidth = 2;
      context.strokeStyle = outline.accepted ? ACCEPTED_COLOR : SKIPPED_COLOR;
      for (const eye of [outline.left, outline.right]) {
        context.beginPath();
        eye.forEach((point, index) => {
          const { x, y } = projectPoint(point, geometry);
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        });
        context.closePath();
        context.stroke();
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
    },
    destroy() {
      canvas?.remove();
      canvas = null;
    },
  };
}
