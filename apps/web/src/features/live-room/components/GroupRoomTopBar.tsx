import { ChevronRight, SwitchCamera, Volume2, VolumeOff } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { SubjectColorDot } from "@/features/study-session/components/SubjectColorDot";
import { formatElapsed, toKoreanDuration } from "@/features/study-session/formatDuration";
import { cn } from "@/lib/utils";

// 영상 위에 바탕 없이 놓이는 글자와 아이콘이라 그림자로 띄운다.
const ON_VIDEO_SHADOW = "text-shadow-[0_1px_3px_rgb(0_0_0/0.45)]";
const ON_VIDEO_TEXT = `text-white ${ON_VIDEO_SHADOW}`;
const ON_VIDEO_ICON = "drop-shadow-[0_1px_3px_rgb(0_0_0/0.45)]";

const ICON_BUTTON =
  "flex size-11 shrink-0 items-center justify-center text-white focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none disabled:opacity-40";

/** 화면 탭은 조작을 숨기고 보이는 토글이라 위쪽 버튼의 누름이 거기까지 올라가지 않게 끊는다. */
function stopSurfaceToggle(event: ReactPointerEvent) {
  event.stopPropagation();
}

/**
 * 그룹 공부방 위쪽 조작
 *
 * 왼쪽은 고른 과목, 가운데는 내 순공과 총 시간, 오른쪽은 다른 사람 소리 끄기와 카메라 전환이다.
 * 조작이 숨어도 내 순공은 늘 보여야 해서 순공 뱃지만 남기고 나머지는 흐리게 감춘다.
 * 숨은 버튼이 탭을 가로채면 화면 탭으로 조작을 다시 부를 수 없어서 숨은 동안은 누름과 포커스를 막는다.
 */
export function GroupRoomTopBar({
  subject,
  focusSec,
  studySec,
  paused,
  hidden,
  inactive = false,
  subjectDisabled = false,
  othersMuted,
  flipDisabled,
  onOpenSubject,
  onToggleOthersMuted,
  onFlipCamera,
}: {
  subject: { name: string; colorIndex: number } | null;
  focusSec: number;
  studySec: number;
  /** 측정이 멈춰 있다. 휴식도 멈춘 것으로 본다. */
  paused: boolean;
  /** 조작 자동 숨김 */
  hidden: boolean;
  /** 메뉴나 위에 겹친 화면이 열린 동안 바깥 누름이 버튼에 먹히지 않고 그 화면을 닫게 한다. */
  inactive?: boolean;
  /** 제출 중에는 과목 화면을 열 수 없다. */
  subjectDisabled?: boolean;
  othersMuted: boolean;
  flipDisabled: boolean;
  onOpenSubject: (opener: HTMLElement) => void;
  onToggleOthersMuted: () => void;
  onFlipCamera: () => void;
}) {
  const { t } = useTranslation(["live-room", "study-session"]);
  const fadable = cn(
    "transition-opacity duration-300 motion-reduce:transition-none",
    hidden && "opacity-0",
    hidden || inactive ? "pointer-events-none" : "pointer-events-auto",
  );
  return (
    <div
      data-room-controls=""
      className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+6px)] right-[calc(env(safe-area-inset-right)+8px)] left-[calc(env(safe-area-inset-left)+8px)] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 landscape-compact:top-[calc(env(safe-area-inset-top)+10px)] regular:top-[calc(env(safe-area-inset-top)+10px)]"
    >
      <div inert={hidden} className={cn("flex min-w-0 justify-start", fadable)}>
        <button
          type="button"
          aria-haspopup="dialog"
          disabled={subjectDisabled}
          onPointerDown={stopSurfaceToggle}
          onClick={(event) => onOpenSubject(event.currentTarget)}
          className={cn(
            "flex min-h-11 max-w-full min-w-0 items-center gap-1.5 px-2 text-[15px] leading-5 font-semibold focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none",
            ON_VIDEO_TEXT,
          )}
        >
          {subject === null ? (
            <span>{t("study-session:subjectSheet.title")}</span>
          ) : (
            <>
              <SubjectColorDot colorIndex={subject.colorIndex} />
              <span className="sr-only">{t("study-session:subjectSheet.title")} </span>
              <span className="truncate">{subject.name}</span>
            </>
          )}
          <ChevronRight aria-hidden="true" className={cn("size-4 shrink-0", ON_VIDEO_ICON)} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-1 pt-1.5">
        <Badge
          data-testid="group-room-focus-badge"
          data-state={paused ? "paused" : "focus"}
          variant={paused ? "session-paused" : "session-focus"}
          className="font-bold"
        >
          <span aria-hidden="true">{formatElapsed(focusSec)}</span>
          <span className="sr-only">
            {t("time.aria.focus", { duration: toKoreanDuration(focusSec) })}
          </span>
        </Badge>
        <p
          aria-hidden={hidden || undefined}
          className={cn(
            // 태블릿에서는 옛 시간 글자처럼 총 줄도 한 단계씩 키운다.
            "text-xs leading-4 font-bold text-text-tertiary tabular-nums regular:text-sm regular:leading-4.75 short-side-lg:text-lg short-side-lg:leading-6",
            ON_VIDEO_SHADOW,
            "transition-opacity duration-300 motion-reduce:transition-none",
            hidden && "opacity-0",
          )}
        >
          <span aria-hidden="true">{`${t("time.total")} ${formatElapsed(studySec)}`}</span>
          <span className="sr-only">
            {t("time.aria.total", { duration: toKoreanDuration(studySec) })}
          </span>
        </p>
      </div>

      <div inert={hidden} className={cn("flex justify-end", fadable)}>
        <button
          type="button"
          aria-label={t("groupRoomTopBar.aria.muteOthers")}
          aria-pressed={othersMuted}
          onPointerDown={stopSurfaceToggle}
          onClick={onToggleOthersMuted}
          className={ICON_BUTTON}
        >
          {othersMuted ? (
            <VolumeOff aria-hidden="true" className={cn("size-6", ON_VIDEO_ICON)} />
          ) : (
            <Volume2 aria-hidden="true" className={cn("size-6", ON_VIDEO_ICON)} />
          )}
        </button>
        <button
          type="button"
          aria-label={t("groupRoomTopBar.aria.switchCamera")}
          disabled={flipDisabled}
          onPointerDown={stopSurfaceToggle}
          onClick={onFlipCamera}
          className={ICON_BUTTON}
        >
          <SwitchCamera aria-hidden="true" className={cn("size-6", ON_VIDEO_ICON)} />
        </button>
      </div>
    </div>
  );
}
