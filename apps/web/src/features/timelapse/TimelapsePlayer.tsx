import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

import { canvasSizeFor, drawTimelapseFrame, type TimelapseScene } from "./timelapseFrame";
import type { TimelapseAspect } from "./timelapseSettings";
import { useTimelapsePlayer } from "./useTimelapsePlayer";

const NO_PHOTOS: readonly ArrayBuffer[] = [];

type TimelapsePlayerProps = {
  aspect: TimelapseAspect;
  photos: readonly ArrayBuffer[];
  overlay: Pick<TimelapseScene, "info" | "text" | "flow">;
  className?: string;
};

/**
 * 저장된 타임랩스 재생기
 *
 * 절반 이상 화면에 보일 때만 재생하고 끝나면 처음부터 다시 돈다.
 * 저절로 오래 움직이는 화면이라 일시정지 버튼을 두고, 움직임 줄이기 설정이면 멈춘 채로 시작한다.
 * 캔버스 글자가 대체 글꼴로 먼저 그려지지 않게 Pretendard를 불러온 뒤 그린다.
 */
export function TimelapsePlayer({ aspect, photos, overlay, className }: TimelapsePlayerProps) {
  const { ref, inView } = useInView({ threshold: 0.5 });
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  const [fontsReady, setFontsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizedRef = useRef(false);
  const size = canvasSizeFor(aspect);
  const lastIndex = Math.max(1, photos.length - 1);

  useEffect(() => {
    let cancelled = false;
    const loading = document.fonts?.load(`800 16px Pretendard`) ?? Promise.resolve();
    // 글꼴을 못 불러와도 대체 글꼴로 재생한다.
    void loading
      .catch(() => {})
      .then(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { index } = useTimelapsePlayer({
    photos: fontsReady ? photos : NO_PHOTOS,
    playing: inView && !paused,
    // D-Day·연속 공부처럼 늦게 오는 값이 멈춘 화면에도 반영되게 한다.
    redrawKey: JSON.stringify(overlay),
    draw: (photo, frame) => {
      const canvas = canvasRef.current;
      if (canvas === null) {
        return;
      }
      // 사진 크기는 기기 카메라마다 달라 처음 그린 장에 한 번만 맞춘다.
      if (!sizedRef.current && photo.width > 0) {
        canvas.width = photo.width;
        canvas.height = photo.height;
        sizedRef.current = true;
      }
      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        return;
      }
      drawTimelapseFrame(ctx, {
        width: canvas.width,
        height: canvas.height,
        ...overlay,
        photo,
        progress: frame / lastIndex,
      });
    },
  });

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-[14px] bg-[#333e4d]",
        aspect === "9:16" ? "h-[427px] w-[240px]" : "aspect-video w-full",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        aria-hidden="true"
        className="block size-full"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-3 bottom-[3px] h-[3px] overflow-hidden rounded-[2px] bg-white/30"
      >
        <div
          data-testid="timelapse-progress"
          className="h-full bg-white"
          style={{ width: `${Math.round((index / lastIndex) * 100)}%` }}
        />
      </div>
      {/* 오른쪽 아래는 영상 정보 자리라 비어 있는 왼쪽 아래에 둔다. */}
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? "타임랩스 재생" : "타임랩스 일시정지"}
        className="absolute bottom-6 left-1.5 flex size-11 items-center justify-center rounded-full text-white focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-black/35">
          {paused ? (
            <Play size={16} fill="currentColor" aria-hidden="true" />
          ) : (
            <Pause size={16} fill="currentColor" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  );
}
