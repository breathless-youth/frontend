import { ChevronRight } from "lucide-react";
import { useRef, type PointerEvent, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SessionClock } from "@/features/study-session/components/SessionClock";
import { ExpandGlyph } from "@/features/study-session/components/SessionControlButtons";
import { FakeBar, FakePill } from "@/features/study-session/components/SessionHelpScreen";
import {
  PIP_ANCHOR,
  PIP_SIZE,
  SESSION_LAYER_INSET,
  WALLPAPER_CLOCK_ANCHOR,
} from "@/features/study-session/sessionLayout";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { cn } from "@/lib/utils";

import { panZoom, type GestureBase, type PhotoFit } from "./photoFit";
import { TimerBackgroundLayer } from "./TimerBackgroundLayer";
import type { BackgroundPhotoView } from "./timerBackgroundQueries";
import { WallpaperScrim } from "./WallpaperScrim";
import { WatcherDemo } from "./watcher/WatcherBackground";

/** 시안의 미리보기 숫자(01:12:30, 순공 01:03:12, 오늘 누적 04:15:40) */
const SAMPLE_STUDY_SEC = 4350;
const SAMPLE_FOCUS_SEC = 3792;
const SAMPLE_TODAY_SEC = 15340;

/** 휠 한 칸이 바꾸는 배율. 트랙패드 핀치(ctrl+휠)는 더 민감하다. */
const WHEEL_ZOOM = 0.002;
const PINCH_WHEEL_ZOOM = 0.01;

export interface TimerBackgroundPreviewProps {
  /** 내 사진이 아니면 null이다. */
  photo: BackgroundPhotoView | null;
  /** 독서실 감독관 배경이면 감독관이 들어오기 전 빈 방을 깐다. */
  proctor?: boolean;
  fit: PhotoFit;
  onFitChange: (fit: PhotoFit) => void;
  onApply: () => void;
  /** 적용하는 중이면 버튼을 막고 진행 표시를 한다. */
  applying?: boolean;
}

/**
 * 타이머 배경 미리보기
 *
 * 공부 화면을 실제와 같은 부품과 자리로 그려 70%로 줄여 보이고, 아래 `적용하기`로 확정한다.
 * 내 사진이면 화면을 한 손가락으로 끌어 위치를, 두 손가락으로 벌려 크기를 맞춘다.
 * 줄인 화면은 transform으로 줄였을 뿐 실제 화면 크기로 그려져 조정값이 공부 화면과 같게 보인다.
 * 머리 줄(뒤로 가기·제목)은 페이지의 머리 줄이 맡는다.
 */
export function TimerBackgroundPreview({
  photo,
  proctor = false,
  fit,
  onFitChange,
  onApply,
  applying = false,
}: TimerBackgroundPreviewProps) {
  const { t } = useTranslation("settings");
  const wallpaper = photo !== null || proctor;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<GestureBase | null>(null);

  function gesture() {
    const points = [...pointers.current.values()];
    const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const dist =
      points.length >= 2 ? Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y) : 0;
    return { cx, cy, dist };
  }

  // 손가락 수가 바뀌면 그 순간을 새 기준으로 잡아 사진이 튀지 않게 한다.
  function rebase() {
    base.current = pointers.current.size > 0 ? { fit, ...gesture() } : null;
  }

  function adjust(element: HTMLElement, next: { cx: number; cy: number; dist: number }) {
    if (photo === null || base.current === null) return;
    const rect = element.getBoundingClientRect();
    onFitChange(panZoom(base.current, next, { width: rect.width, height: rect.height }, photo));
  }

  const gestureHandlers =
    photo === null
      ? {}
      : {
          onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            rebase();
          },
          onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
            if (!pointers.current.has(event.pointerId)) return;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            adjust(event.currentTarget, gesture());
          },
          onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
            pointers.current.delete(event.pointerId);
            rebase();
          },
          onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
            pointers.current.delete(event.pointerId);
            rebase();
          },
          // 컴퓨터 브라우저는 휠과 트랙패드 핀치로 크기를 바꾼다.
          onWheel: (event: WheelEvent<HTMLDivElement>) => {
            const factor = Math.exp(
              -event.deltaY * (event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM),
            );
            base.current = { fit, cx: 0, cy: 0, dist: 1 };
            adjust(event.currentTarget, { cx: 0, cy: 0, dist: factor });
            base.current = null;
          },
        };

  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-soft-blue">
      <div
        role="img"
        aria-label={t("timerBackground.preview.screen")}
        data-testid="timer-background-preview"
        {...gestureHandlers}
        style={sessionSurfaceStyle}
        className={cn(
          "theme-dark absolute inset-0 origin-top select-none translate-y-[calc(env(safe-area-inset-top)+58px)] scale-70 overflow-hidden rounded-[40px] bg-(--session-camera-base) text-white shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.12)]",
          photo !== null && "cursor-grab touch-none",
        )}
      >
        {photo !== null && <TimerBackgroundLayer src={photo.src} fit={fit} />}
        {proctor && <WatcherDemo />}
        {wallpaper && <WallpaperScrim />}
        <div
          aria-hidden="true"
          className={cn("relative flex h-full flex-col items-center", SESSION_LAYER_INSET)}
        >
          <div className="flex w-full items-start justify-between">
            <div className="flex min-h-11 flex-col items-start gap-1 py-1 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-(--session-control-resume-bg)" />
                <span className="text-lg leading-6.5 font-bold">
                  {t("timerBackground.preview.subject")}
                </span>
                <ChevronRight className="size-4 text-white/60" strokeWidth={2} />
              </span>
              <span className="pl-4.5 text-[13px] leading-5 text-white/70">
                {t("timerBackground.preview.task")}
              </span>
            </div>
            <div className="flex gap-2">
              <FakePill icon="ambient" />
              <FakePill icon="more" />
            </div>
          </div>
          <div className="h-7.5 shrink-0" />
          <div className={wallpaper ? WALLPAPER_CLOCK_ANCHOR : undefined}>
            <SessionClock
              studySec={SAMPLE_STUDY_SEC}
              focusSec={SAMPLE_FOCUS_SEC}
              todayStudySec={SAMPLE_TODAY_SEC}
              state="focus"
              statusLabel=""
              simple={false}
              corner={wallpaper}
              infoOpen={false}
              onToggleInfo={() => {}}
              fake
            />
          </div>
          <div className="grow" />
          <FakeBar />
        </div>
        <div
          aria-hidden="true"
          className={cn(
            PIP_ANCHOR,
            PIP_SIZE,
            "flex items-end rounded-lg bg-[linear-gradient(160deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04)),var(--session-camera-base)] shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.12)]",
          )}
        >
          <span className="m-2 rounded-full bg-(--session-pill-bg) px-2 py-0.5 text-xs leading-4 text-white/85">
            {t("timerBackground.preview.camera")}
          </span>
          <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-(--session-pill-bg)">
            <ExpandGlyph className="size-4" />
          </span>
        </div>
      </div>
      <div className="absolute inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+20px)]">
        <Button
          size="xl"
          onClick={onApply}
          disabled={applying}
          aria-busy={applying}
          className="w-full font-bold shadow-sb-cta"
        >
          {applying && (
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current/35 border-t-current"
            />
          )}
          {t(applying ? "timerBackground.applying" : "timerBackground.apply")}
        </Button>
      </div>
    </div>
  );
}
