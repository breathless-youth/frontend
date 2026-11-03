import { Crown, Ellipsis, UserMinus } from "lucide-react";
import { useId } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { GROUP_ROOM_LIMITS } from "../model/limits";
import { GROUP_MENU_CONTENT_CLASS, GROUP_MENU_ITEM_CLASS } from "./groupMenuClass";

const KICK_NOTE = `${GROUP_ROOM_LIMITS.kickCooldownDays}일 동안 이 그룹에 다시 들어올 수 없어요`;

/**
 * 멤버 관리의 멤버 줄 메뉴
 *
 * 그룹장이 다른 멤버에게 그룹장을 넘기거나 멤버를 내보낸다.
 * 내보내면 한동안 다시 들어올 수 없다는 안내를 항목 아래에 두어 항목의 설명으로 읽히게 한다.
 * 확인 창은 호출부가 띄우고 여기서는 고른 일만 넘긴다.
 */
export function MemberMenu({
  nickname,
  onTransfer,
  onKick,
  defaultOpen = false,
}: {
  nickname: string;
  onTransfer: () => void;
  onKick: () => void;
  /** 개발용 화면 모음에서 메뉴가 열린 모습을 바로 보려고 쓴다. */
  defaultOpen?: boolean;
}) {
  const noteId = useId();
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        aria-label={`${nickname} 메뉴`}
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none data-[state=open]:bg-bg-layer-2 data-[state=open]:text-foreground"
      >
        <Ellipsis aria-hidden="true" size={20} strokeWidth={2.4} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 탭이 씹히므로, touchmove를 잠금까지 올려 보내지 않고 끌어서 밀릴 것도 없게 터치 팬을 끈다.
        onTouchMove={(event) => event.stopPropagation()}
        className={cn(GROUP_MENU_CONTENT_CLASS, "w-59")}
      >
        <DropdownMenuItem onSelect={onTransfer} className={GROUP_MENU_ITEM_CLASS}>
          <Crown aria-hidden="true" size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">그룹장 넘기기</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          aria-label="내보내기"
          aria-describedby={noteId}
          onSelect={onKick}
          className={cn(GROUP_MENU_ITEM_CLASS, "items-start")}
        >
          <UserMinus
            aria-hidden="true"
            size={18}
            className="mt-0.5 shrink-0 text-feedback-danger"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-feedback-danger">내보내기</span>
            <span id={noteId} className="text-xs leading-4.5 font-normal text-muted-foreground">
              {KICK_NOTE}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
