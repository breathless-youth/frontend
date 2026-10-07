import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

import {
  canvasSizeFor,
  drawTimelapseFrame,
  TIMELAPSE_FONT_FAMILY,
  timelapseGlyphs,
  type TimelapseScene,
} from "./timelapseFrame";
import type { TimelapseAspect } from "./timelapseSettings";
import { useTimelapsePlayer } from "./useTimelapsePlayer";

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
 * 글꼴을 기다리지 않고 바로 그린다. Pretendard가 늦게 오면 처음 몇 장은 대체 글꼴이고,
 * 도착하면 멈춘 화면도 다시 그린다. 글꼴 요청이 멈추면 빈 상자로 남았다.
 */
export function TimelapsePlayer({ aspect, photos, overlay, className }: TimelapsePlayerProps) {
  const { ref, inView } = useInView({ threshold: 0.5 });
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  // 마지막으로 글꼴을 받아 둔 글자
  const [loadedGlyphs, setLoadedGlyphs] = useState<string | null>(null);
  const glyphs = timelapseGlyphs(overlay.text);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const size = canvasSizeFor(aspect);
  const lastIndex = Math.max(1, photos.length - 1);
  // 흐름 바가 같은 자리에서 진행만큼 채워지므로 그때는 진행 막대를 따로 두지 않는다.
  const showProgress = !(overlay.info.flowBar && overlay.flow !== null);

  useEffect(() => {
    let cancelled = false;
    // 한글은 여러 조각 파일로 나뉘어 있어 그릴 글자를 넘겨야 그 글자가 든 조각을 받는다.
    const loading =
      document.fonts?.load(`800 16px ${TIMELAPSE_FONT_FAMILY}`, glyphs) ?? Promise.resolve();
    void loading
      .catch(() => {})
      .then(() => {
        if (!cancelled) setLoadedGlyphs(glyphs);
      });
    return () => {
      cancelled = true;
    };
  }, [glyphs]);

  useTimelapsePlayer({
    photos,
    playing: inView && !paused,
    // D-Day·연속 공부처럼 늦게 오는 값이 멈춘 화면에도 반영되게 한다.
    // 늦게 온 글자의 글꼴이 도착하면 멈춘 화면도 그 글꼴로 다시 그린다.
    redrawKey: JSON.stringify(overlay) + loadedGlyphs,
    draw: (photo, frame) => {
      const canvas = canvasRef.current;
      if (canvas === null) {
        return;
      }
      // 진행 막대는 렌더 없이 직접 바꾼다. 초당 12번 컴포넌트를 다시 그릴 이유가 없다.
      if (progressRef.current !== null) {
        progressRef.current.style.width = `${Math.round((frame / lastIndex) * 100)}%`;
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
        // 높이는 캔버스 자체 비율이 정한다. 기기 웹뷰가 화면을 돌린 뒤
        // aspect-ratio 높이를 다시 계산하지 않아 영상이 찌그러졌다.
        aspect === "9:16" ? "w-[240px]" : "w-full",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        aria-hidden="true"
        className="block h-auto w-full"
      />
      {showProgress && (
        // 둥근 모서리에 닿지 않게 워터마크와 같은 거리만큼 안쪽에 둔다.
        <div
          aria-hidden="true"
          className="absolute inset-x-3 bottom-3 h-[3px] overflow-hidden rounded-[2px] bg-white/30"
        >
          <div
            ref={progressRef}
            data-testid="timelapse-progress"
            className="bg-primary h-full"
            style={{ width: "0%" }}
          />
        </div>
      )}
      {/* 오른쪽 아래는 영상 정보 자리라 비어 있는 왼쪽 아래에 둔다. */}
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? "타임랩스 재생" : "타임랩스 일시정지"}
        className="absolute bottom-7 left-1.5 flex size-11 items-center justify-center rounded-full text-white focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-black/35">
          {paused ? (
            <Play size={18} fill="currentColor" aria-hidden="true" />
          ) : (
            <Pause size={18} fill="currentColor" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  );
}
