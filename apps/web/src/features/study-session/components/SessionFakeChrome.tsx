import { ChevronRight, Ellipsis } from "lucide-react";

import { AmbientLinesIcon } from "@/features/ambient-sound/components/AmbientSoundButton";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import {
  BAR_ICON_SIZE,
  ExitGlyph,
  PauseGlyph,
  SESSION_BAR,
  SESSION_BAR_MUTED,
} from "@/features/study-session/components/SessionControlButtons";
import { SESSION_PILL_BUTTON } from "@/features/study-session/components/SessionMoreMenu";
import { cn } from "@/lib/utils";

/**
 * 세션 화면을 흉내 낸 가짜 머리 줄·알약·하단 바
 *
 * 타이머 배경 미리보기와 세션 도움말이 실제 세션과 같은 모양과 자리로 그리되, 누름은 받지 않는다.
 * 실제 버튼을 쓰지 않는 이유는 라이브 리전과 앱 glass 버튼 등록이 따라오기 때문이다.
 */
const FAKE_BUTTON = "pointer-events-none";

/** 가짜 하단 바. 일시정지와 종료를 실제와 같은 모양으로 그린다. `muted`는 심플 모드의 옅은 바다. */
export function FakeBar({ muted = false }: { muted?: boolean }) {
  return (
    <div className={cn(muted ? SESSION_BAR_MUTED : SESSION_BAR, "relative")}>
      <span
        className={cn(
          controlButtonVariants({ variant: muted ? "pauseMuted" : "pause", size: "bar" }),
          FAKE_BUTTON,
        )}
      >
        <PauseGlyph aria-hidden className={BAR_ICON_SIZE} />
      </span>
      <span
        className={cn(
          controlButtonVariants({ variant: muted ? "stopMuted" : "stop", size: "bar" }),
          FAKE_BUTTON,
        )}
      >
        <ExitGlyph aria-hidden className={BAR_ICON_SIZE} />
      </span>
    </div>
  );
}

/** 가짜 알약 버튼(배경음·더보기) */
export function FakePill({ icon }: { icon: "ambient" | "more" }) {
  return (
    <span className={cn(SESSION_PILL_BUTTON, FAKE_BUTTON)}>
      {icon === "ambient" ? (
        <AmbientLinesIcon on={false} />
      ) : (
        <Ellipsis aria-hidden className="size-5" strokeWidth={2} />
      )}
    </span>
  );
}

/** 가짜 머리 줄. 왼쪽 과목·할 일과 오른쪽 배경음·더보기 알약이다. */
export function FakeSessionHeader({ subject, task }: { subject: string; task: string }) {
  return (
    <div className="flex w-full items-start justify-between">
      <div className="flex min-h-11 flex-col items-start gap-1 py-1 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-(--session-control-resume-bg)" />
          <span className="text-lg leading-6.5 font-bold">{subject}</span>
          <ChevronRight className="size-4 text-white/60" strokeWidth={2} />
        </span>
        <span className="pl-4.5 text-[13px] leading-5 text-white/70">{task}</span>
      </div>
      <div className="flex gap-2">
        <FakePill icon="ambient" />
        <FakePill icon="more" />
      </div>
    </div>
  );
}
