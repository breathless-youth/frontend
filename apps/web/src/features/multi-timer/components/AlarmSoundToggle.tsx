import { Bell, BellOff } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { ICON_POP_CLASS } from "@/features/study-session/components/SessionControlButtons";
import { cn } from "@/lib/utils";

/**
 * 끝 알림음 켜고 끄기
 *
 * 진행 중에도 바꿀 수 있어서 모드 상태와 상관없이 그린다.
 * 종 그림은 켜짐과 꺼짐에 따라 바뀌고 세션 조작 버튼과 같은 팝으로 갈아 끼운다.
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
    <div className={cn("flex items-center gap-2", className)}>
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
