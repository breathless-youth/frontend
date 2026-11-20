import { Image, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SessionPageOpenScope } from "@/features/study-session/components/SessionPage";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { SpaceContent } from "@/features/timer-background/components/SessionSpacePage";
import {
  useTimerBackground,
  writeTimerBackground,
} from "@/features/timer-background/timerBackground";

import { RAIL_BUTTON_CLASS } from "./railButtonClass";

// 영상 공간이 닫혀 있어 본문이 소리 줄을 그리지 않으므로 음량 값과 손잡이는 자리만 채운다.
// ponytail: 손잡이가 아무 일도 하지 않아 영상 공간이 열리면 플라이아웃의 소리 줄은 움직이지 않는다.
// 지금은 소리 줄이 그려지지 않아 상관없고, 영상 공간을 열 때 세션의 음량 상태를 이 창으로 옮긴다.
const noop = () => {};

/**
 * 레일의 공간 버튼과 플라이아웃
 *
 * 세션 공간 페이지의 본문을 비모달 창에 담아 홈을 가리지 않고, 고른 공간을 바로 월페이퍼로 보인다.
 * 포털 자리를 홈 상자로 받아 상자 기준으로 놓이고 끌어 옮기는 패널보다 위 층에 그린다.
 * 본문이 세션처럼 늘 어두운 색을 쓰므로 창에도 세션 변수와 다크 테마를 단다.
 * 바깥을 눌러 닫으면 누른 곳에 포커스를 두고, Esc·닫기·다시 누르기로 닫으면 공간 버튼으로 돌려준다.
 * ponytail: 플라이아웃이 하나라 열림 상태를 여기 두고, 둘 이상이 되면 레일로 올려 하나만 열리게 한다.
 */
export function PcSpaceFlyout({ container }: { container: HTMLElement | null }) {
  const { t } = useTranslation(["study-session", "common"]);
  const [open, setOpen] = useState(false);
  const applied = useTimerBackground();
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
        style={sessionSurfaceStyle}
        // 레일(왼쪽 24 + 폭 88) 오른쪽 12px에서 시작해 상자 아래 16px까지 닿는다.
        className="theme-dark absolute top-6 bottom-4 left-31 flex w-95 max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-xl border-0 bg-(--session-dialog-bg) p-0 text-white sm:rounded-xl"
      >
        <div className="flex h-13 shrink-0 items-center justify-between pr-1 pl-6">
          <DialogTitle className="text-[17px] leading-5.25 font-bold tracking-normal text-(--session-dialog-title)">
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
            onApply={writeTimerBackground}
            volume={0}
            onVolumeChange={noop}
            onVolumeCommit={noop}
            onToggleMute={noop}
            listOnly
            surface="pc_home"
          />
        </SessionPageOpenScope>
      </DialogContent>
    </Dialog>
  );
}
