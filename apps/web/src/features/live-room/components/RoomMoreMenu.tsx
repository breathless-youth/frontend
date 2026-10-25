import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import moreIcon from "@/assets/icons/session-more.svg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const MENU_ITEM_CLASS =
  "h-11 rounded-none px-6 py-0 text-[17px] leading-5.5 font-normal text-white focus:bg-white/10";

/**
 * 더보기 버튼 누름의 화면 탭 토글 차단
 *
 * 열린 메뉴를 이 버튼으로 닫으면 강제 표시가 먼저 풀려서 같은 누름의 손 뗌이 조작을 숨긴다.
 * 메뉴 안의 누름은 끊지 않는다.
 * 끊으면 바깥 누름을 가려내는 Radix 문서 리스너가 그 누름을 못 봐서 다음 바깥 누름 한 번을 안쪽으로 잘못 센다.
 */
function stopSurfaceToggle(event: ReactPointerEvent) {
  event.stopPropagation();
}

type RoomMoreMenuProps = {
  /** 메뉴 포털 자리. 세션 화면 변수와 다크 테마를 받으려면 세션 루트를 넘긴다. */
  container: HTMLElement | null;
  flipDisabled: boolean;
  onFlipCamera: () => void;
  onShareInvite: () => void;
  /** 조작 숨김. 숨은 버튼이 탭을 가로채면 화면 탭으로 조작을 다시 부를 수 없다. */
  hidden?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * 소셜룸 오른쪽 위 더보기 버튼과 메뉴
 *
 * 메뉴 창의 오른쪽 위를 보이는 원의 오른쪽 위에 맞춰 버튼 자리를 덮으며 열리게 한다.
 * 메뉴가 열려 있는 동안은 호출부가 조작을 강제로 보여서 메뉴 안의 누름이 화면 탭 토글로 올라가도 상관없다.
 */
export function RoomMoreMenu({
  container,
  flipDisabled,
  onFlipCamera,
  onShareInvite,
  hidden = false,
  onOpenChange,
}: RoomMoreMenuProps) {
  // 메뉴가 버튼 자리를 덮으며 열려서 마우스로 버튼을 짧게 누르면 손을 뗀 곳이 첫 항목이 된다.
  // Radix 항목은 그 손 뗌만으로도 선택되므로 메뉴 안에서 시작한 누름일 때만 손 뗌 선택을 허용한다.
  const pressStartedInMenuRef = useRef(false);
  const blockOpeningPressRelease = (event: ReactPointerEvent) => {
    if (!pressStartedInMenuRef.current) {
      event.preventDefault();
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        pressStartedInMenuRef.current = false;
        onOpenChange?.(open);
      }}
    >
      <DropdownMenuTrigger
        aria-label="더보기"
        data-room-controls=""
        inert={hidden}
        onPointerDown={stopSurfaceToggle}
        className={cn(
          "absolute top-[env(safe-area-inset-top)] right-[calc(env(safe-area-inset-right)+10px)] flex size-11 items-center justify-center transition-opacity duration-300 motion-reduce:transition-none landscape-compact:top-[calc(env(safe-area-inset-top)+10px)] regular:top-[calc(env(safe-area-inset-top)+10px)]",
          hidden ? "pointer-events-none opacity-0" : "pointer-events-auto",
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-(--session-bar-glass-bg) shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]">
          <img src={moreIcon} alt="" className="h-1 w-4.5" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        container={container}
        align="end"
        // 버튼 아래가 아니라 원의 위 끝에 붙이고, 오른쪽 끝도 원에 맞춘다(누르는 영역이 원보다 사방 6px 넓다).
        sideOffset={-38}
        alignOffset={6}
        onPointerDownCapture={() => {
          pressStartedInMenuRef.current = true;
        }}
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 항목 탭이 씹힌다.
        onTouchMove={(event) => event.stopPropagation()}
        className="min-w-50 rounded-[26px] border-0 bg-[rgba(30,34,44,0.45)] px-0 py-1.5 shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[20px]"
      >
        <DropdownMenuItem
          disabled={flipDisabled}
          onPointerUp={blockOpeningPressRelease}
          onSelect={onFlipCamera}
          className={MENU_ITEM_CLASS}
        >
          카메라 전환
        </DropdownMenuItem>
        <DropdownMenuItem
          onPointerUp={blockOpeningPressRelease}
          onSelect={onShareInvite}
          className={MENU_ITEM_CLASS}
        >
          초대코드 공유
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
