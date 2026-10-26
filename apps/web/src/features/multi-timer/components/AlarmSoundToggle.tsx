import { Bell, BellOff } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { ICON_POP_CLASS } from "@/features/study-session/components/SessionControlButtons";
import { cn } from "@/lib/utils";

/**
 * 끝 알림음 켜고 끄기
 *
 * 진행 중에도 바꿀 수 있어서 모드 상태와 상관없이 그린다.
 * 종 그림은 켜짐과 꺼짐에 따라 바뀌고 세션 조작 버튼과 같은 팝으로 갈아 끼운다.
 * 폰 가로에서는 두 모드 모두 화면 오른쪽 아래, 측정 화면의 나가기 버튼 자리에 둔다.
 */
export function AlarmSoundToggle({
  soundOn,
  onChangeSoundOn,
  className,
}: {
  soundOn: boolean;
  onChangeSoundOn: (on: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        className,
        "landscape-compact:absolute landscape-compact:right-[calc(env(safe-area-inset-right)+16px)] landscape-compact:bottom-[max(env(safe-area-inset-bottom),calc((env(safe-area-inset-bottom)+14px)/2))]",
      )}
    >
      {soundOn ? (
        <Bell
          key="on"
          data-testid="icon-bell"
          aria-hidden="true"
          className={cn("size-4 text-text-tertiary", ICON_POP_CLASS)}
        />
      ) : (
        <BellOff
          key="off"
          data-testid="icon-bell-off"
          aria-hidden="true"
          className={cn("size-4 text-text-tertiary", ICON_POP_CLASS)}
        />
      )}
      <Switch checked={soundOn} onCheckedChange={onChangeSoundOn} aria-label="알림음" />
    </div>
  );
}
