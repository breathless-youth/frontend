import { Image, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SessionPageOpenScope } from "@/features/study-session/components/SessionPage";
import { SpaceContent } from "@/features/timer-background/components/SessionSpacePage";
import {
  SIMPLE_BACKGROUND_COLOR,
  type TimerBackgroundSelection,
  useTimerBackground,
} from "@/features/timer-background/timerBackground";
import { PC_WATCH_VIEWPORT } from "@/features/timer-background/spaceFiles";
import { commitTimerBackground, useSpaceApply } from "@/features/timer-background/useSpaceApply";
import { useUserId } from "@/lib/userId";

import { RAIL_BUTTON_CLASS } from "./railButtonClass";
import { isStudyPanelEvent } from "./studyPanelEvents";

// PC 홈은 감시 소리를 내지 않아 음량 값과 손잡이는 자리만 채운다.
// ponytail: 감시 공간을 고르면 소리 줄이 켜져도 움직이지 않는다. PC에서 감시 소리를 낼 때 세션의 음량 상태를 이 창에 연결한다.
const noop = () => {};

// 공간 본문은 세션 변수로 칠해져서, 여기서는 그 변수를 홈 공부시간 패널과 같은 앱 테마 변수로 채운다.
// 값이 앱 테마 변수를 가리키므로 라이트·다크를 바꾸면 창도 따라 바뀐다.
const PC_SPACE_SURFACE = {
  "--session-dialog-title": "var(--foreground)",
  "--session-dialog-body": "var(--muted-foreground)",
  "--session-sheet-line": "var(--border)",
  "--session-sheet-surface": "var(--bg-layer-2)",
  "--session-dialog-cancel-bg": "var(--bg-layer-2)",
  "--session-dialog-cancel-text": "var(--foreground)",
  // 고른 칸 테두리와 고른 칩은 시안대로 브랜드색으로 칠한다.
  "--session-space-selected": "var(--primary)",
  "--session-space-on-selected": "var(--primary-foreground)",
  "--session-space-tile-line": "var(--border)",
  "--session-space-chip-line": "var(--border)",
  "--session-space-upload-line": "var(--border-strong)",
  "--session-space-tab-idle": "var(--text-tertiary)",
  // 심플 미리보기 바탕은 테마 색이 아니라 심플 공간 자체의 색이다.
  "--session-simple-base": SIMPLE_BACKGROUND_COLOR,
} as unknown as CSSProperties;

// 월페이퍼와 같은 창 크기로 감시 파일을 받아 둔다.
const commitPcSpace = (next: TimerBackgroundSelection) =>
  commitTimerBackground(next, PC_WATCH_VIEWPORT);

/**
 * 레일의 공간 버튼과 플라이아웃
 *
 * 세션 공간 페이지의 본문을 비모달 창에 담아 홈을 가리지 않고, 고른 공간을 바로 월페이퍼로 보인다.
 * 회원은 세션 화면과 같은 규칙으로 서버에도 저장하고 비회원은 기기에만 저장한다.
 * 포털 자리를 홈 상자로 받아 상자 기준으로 놓이고 끌어 옮기는 패널보다 위 층에 그린다.
 * 본문이 읽는 세션 변수를 앱 테마 변수로 채워, 홈 패널처럼 라이트에서는 밝게 다크에서는 어둡게 그린다.
 * 바깥을 눌러 닫으면 누른 곳에 포커스를 두고, Esc·닫기·다시 누르기로 닫으면 공간 버튼으로 돌려준다.
 * 공부시간 패널에서 시작한 누름과 포커스는 바깥으로 보지 않아, 공간을 고르며 패널을 옮기거나 써도 창이 남는다.
 * ponytail: 플라이아웃이 하나라 열림 상태를 여기 두고, 둘 이상이 되면 레일로 올려 하나만 열리게 한다.
 */
export function PcSpaceFlyout({ container }: { container: HTMLElement | null }) {
  const { t } = useTranslation(["study-session", "common"]);
  const [open, setOpen] = useState(false);
  const applied = useTimerBackground();
  const userId = useUserId();
  // 홈에 늘 붙어 있어 회원이면 홈을 열 때 서버 공간으로 맞추고, 고르면 서버에도 저장한다.
  // 그래서 세션이 서버의 옛 값으로 덮지 않는다.
  const applySpace = useSpaceApply(userId, applied, commitPcSpace);
  return (
    <Dialog modal={false} open={open} onOpenChange={setOpen}>
      <DialogTrigger className={RAIL_BUTTON_CLASS}>
        <Image aria-hidden="true" className="size-5" />
        <span className="text-xs leading-4 font-semibold">{t("space.title")}</span>
      </DialogTrigger>
      <DialogContent
        container={container}
        showCloseButton={false}
        // 공용 창은 모달로 표시를 달지만 이 창은 홈을 막지 않아 보조 기술에 모달로 알리지 않는다.
        aria-modal={false}
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          if (isStudyPanelEvent(event.detail.originalEvent)) event.preventDefault();
        }}
        style={PC_SPACE_SURFACE}
        // 레일(왼쪽 24 + 폭 88) 오른쪽 12px에서 시작해 상자 아래 16px까지 닿는다.
        className="absolute top-6 bottom-4 left-31 flex w-95 max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-xl border-0 bg-muted p-0 text-foreground shadow-sb-card sm:rounded-xl"
      >
        <div className="flex h-13 shrink-0 items-center justify-between pr-1 pl-6">
          <DialogTitle className="text-[17px] leading-5.25 font-bold tracking-normal text-foreground">
            {t("space.title")}
          </DialogTitle>
          <DialogClose
            aria-label={t("common:actions.close")}
            className="flex size-11 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
        </div>
        <SessionPageOpenScope open={open}>
          <SpaceContent
            landscape={false}
            applied={applied}
            userId={userId}
            onApply={applySpace}
            volume={0}
            onVolumeChange={noop}
            onVolumeCommit={noop}
            onToggleMute={noop}
            surface="pc_home"
          />
        </SessionPageOpenScope>
      </DialogContent>
    </Dialog>
  );
}
