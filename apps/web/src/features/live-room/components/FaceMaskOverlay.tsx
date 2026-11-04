import { useState, type CSSProperties, type ReactNode } from "react";

import type { CameraFacing } from "@/features/study-session/adapters/cameraAdapter";
import type { FaceSpot } from "@/features/study-session/vision/faceSpot";
import { cn } from "@/lib/utils";

import { maskModeOf } from "../faceMaskPlan";

export interface FaceMaskView {
  readonly spot: FaceSpot | null;
  readonly emojiUrl: string;
}

/**
 * 내 화면 미리보기 얼굴 가림 층
 *
 * 영상을 다시 합성하지 않고 재생 중인 영상 위에 흐림과 이모지 그림만 덧그린다.
 * 흐림은 영상 요소에 직접 `filter`를 걸어야 해서 영상을 `children`으로 감싼다.
 * `mask`가 없어도 같은 트리를 그려, 켜고 끌 때 영상 요소가 다시 마운트되어 재생과 추론이 끊기지 않게 한다.
 * 이모지 위치는 원본 프레임 기준이라, 영상의 `object-cover`와 같은 크기의 상자를 원본 비율로 세워 그 안에 놓는다.
 * 좌표는 그리는 데만 쓰고 어디로도 내보내지 않는다.
 */
export function FaceMaskOverlay({
  mask,
  facing,
  children,
}: {
  /** 없으면 가리지 않는다. */
  mask: FaceMaskView | null;
  facing: CameraFacing;
  children: ReactNode;
}) {
  // 그림을 불러오기 전에 이모지 자리를 비워 두면 얼굴이 드러나므로, 불러온 그림 주소를 들고 그 전에는 흐린다.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const spot = mask?.spot ?? null;
  const mode = mask === null ? "plain" : maskModeOf(spot, loadedUrl === mask.emojiUrl);
  const shown = mode === "sticker";
  const mirrored = facing === "front";

  return (
    <div data-face-mask={mode} className="relative size-full overflow-hidden @container-size">
      <div className={cn("size-full", mode === "blur" && "blur-2xl")}>{children}</div>
      {mask !== null && (
        <div
          data-testid="face-mask-frame"
          aria-hidden="true"
          className={cn(
            // 이모지 위치가 inline style로 남아 Session Replay가 기록하지 않게 좌표를 담은 상자째 막는다.
            "amp-block sentry-block",
            "pointer-events-none absolute top-1/2 left-1/2 h-[max(100cqh,calc(100cqw/var(--face-aspect)))] w-[max(100cqw,calc(100cqh*var(--face-aspect)))] -translate-1/2",
            mirrored && "scale-x-[-1]",
          )}
          style={{ "--face-aspect": spot?.aspect ?? 1 } as CSSProperties}
        >
          <img
            // 사라졌다 다시 나타날 때 옛 자리에서 미끄러지지 않도록 새 요소로 바로 놓는다.
            key={shown ? "shown" : "hidden"}
            data-testid="face-mask-emoji"
            src={mask.emojiUrl}
            alt=""
            draggable={false}
            onLoad={() => setLoadedUrl(mask.emojiUrl)}
            className={cn(
              "absolute aspect-square -translate-1/2 object-contain",
              // 위치는 1~2초마다 바뀌어 그 사이를 미끄러지듯 따라간다.
              shown
                ? "transition-[left,top,width] duration-900 ease-out motion-reduce:transition-none"
                : "opacity-0",
              // 상자를 영상처럼 반전했으니 그림만 다시 뒤집어 원래 방향으로 보이게 한다.
              mirrored && "scale-x-[-1]",
            )}
            style={
              spot === null
                ? undefined
                : {
                    left: `${spot.x * 100}%`,
                    top: `${spot.y * 100}%`,
                    width: `${spot.size * 100}%`,
                  }
            }
          />
        </div>
      )}
    </div>
  );
}
