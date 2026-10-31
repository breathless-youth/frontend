import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";

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

/**
 * 혼자 공부 세션의 더보기 버튼 자리
 *
 * 누르는 영역(44px)의 중심을 상태 필의 가로 중앙선과 사이드 열의 세로 중앙선이 만나는 점에 둔다.
 * 위: 세션 레이어 위 여백(세로 13px, 가로 18px) + 필 높이의 절반 - 22px. 필 높이는 폰 36px, 폭 600 이상 39px, 큰 태블릿 48px이다.
 * 오른쪽: 사이드 열 오른쪽 여백 16px + 버튼 지름의 절반 - 22px. 버튼 지름은 54px, 64px, 80px이다.
 * 사이드 열이 없는 함께 공부 화면은 기본 자리를 쓴다.
 */
export const SOLO_MORE_POSITION =
  "absolute top-[calc(env(safe-area-inset-top)+9px)] right-[calc(env(safe-area-inset-right)+21px)] landscape-compact:top-[calc(env(safe-area-inset-top)+14px)] regular:top-[calc(env(safe-area-inset-top)+10.5px)] regular:right-[calc(env(safe-area-inset-right)+26px)] short-side-lg:top-[calc(env(safe-area-inset-top)+15px)] short-side-lg:right-[calc(env(safe-area-inset-right)+34px)]";

/**
 * 혼자 공부 세션의 메뉴 자리
 *
 * 버튼 아래로 펼치되 메뉴 오른쪽 끝을 사이드 열 왼쪽 8px 앞에, 위 끝을 상태 필 아래 8px에 둔다.
 * Radix의 sideOffset·alignOffset은 숫자 하나라 창 크기별로 바꿀 수 없어서 0으로 두고, 메뉴 자체의 여백으로 민다.
 * 여백도 떠 있는 상자 크기에 들어가서 Radix가 그만큼 감안해 놓는다.
 * 오른쪽: 사이드 열 오른쪽 여백 16px + 버튼 지름(54, 64, 80px) + 8px - 버튼 오른쪽 여백(21, 26, 34px) = 57, 62, 70px
 * 위: 필 높이의 절반(18, 19.5, 24px) + 8px - 누르는 영역 절반 22px = 4, 5.5, 10px. 버튼 중심이 필 중심과 같아서 성립한다.
 * 계산값으로 두면 실측 간격이 9px로 1px 더 벌어져서(원인 미확인) 각각 1px 뺐다. 세로·가로·태블릿에서 8px로 쟀다.
 * 태블릿의 4.5px는 간격 스케일에 없고 임의 px는 쓰지 않아 4px로 둔다(0.5px 차이).
 */
export const SOLO_MORE_MENU_OFFSET =
  "mt-0.75 mr-14.25 regular:mt-1 regular:mr-15.5 short-side-lg:mt-2.25 short-side-lg:mr-17.5";

type SessionMoreMenuProps = {
  /** 메뉴 포털 자리. 세션 화면 변수와 다크 테마를 받으려면 세션 루트를 넘긴다. */
  container: HTMLElement | null;
  flipDisabled?: boolean;
  onFlipCamera: () => void;
  /** 넘긴 방에서만 초대코드 공유 항목이 보인다. */
  onShareInvite?: () => void;
  /** 넘긴 화면에서만 도움말 보기 항목이 보인다. */
  onOpenHelp?: () => void;
  /** 조작 숨김. 숨은 버튼이 탭을 가로채면 화면 탭으로 조작을 다시 부를 수 없다. */
  hidden?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 버튼 자리. 기본 자리를 덮어쓴다. */
  className?: string;
  /** 메뉴로 연 화면이 닫힐 때 초점을 돌려줄 버튼 */
  triggerRef?: Ref<HTMLButtonElement>;
  /**
   * 버튼 바로 아래에 사이드 열이 있는 혼자 공부 화면. 메뉴를 사이드 열 왼쪽, 상태 필 아래로 펼친다.
   * 기본은 버튼 자리를 덮으며 열린다.
   */
  aboveSideColumn?: boolean;
};

/**
 * 세션 화면 오른쪽 위 더보기 버튼과 메뉴
 *
 * 메뉴 창의 오른쪽 위를 보이는 원의 오른쪽 위에 맞춰 버튼 자리를 덮으며 열리게 한다.
 * 메뉴가 열려 있는 동안은 호출부가 조작을 강제로 보여서 메뉴 안의 누름이 화면 탭 토글로 올라가도 상관없다.
 */
export function SessionMoreMenu({
  container,
  flipDisabled = false,
  onFlipCamera,
  onShareInvite,
  onOpenHelp,
  hidden = false,
  onOpenChange,
  className,
  triggerRef,
  aboveSideColumn = false,
}: SessionMoreMenuProps) {
  // 메뉴가 버튼 자리를 덮으며 열려서 버튼을 짧게 누르면 손을 뗀 곳이 첫 항목이 된다.
  // Radix 항목은 그 손 뗌만으로도 선택되므로 메뉴 안에서 시작한 누름일 때만 손 뗌 선택을 허용한다.
  const pressStartedInMenuRef = useRef(false);
  const blockOpeningPressRelease = (event: ReactPointerEvent) => {
    if (!pressStartedInMenuRef.current) {
      event.preventDefault();
    }
  };
  // Android는 손을 뗀 자리의 요소로 클릭까지 보내서 손 뗌을 막아도 그 클릭으로 첫 항목이 골라진다.
  // 키보드와 화면 낭독기가 만든 클릭은 detail이 0이라 그대로 둔다.
  const blockOpeningPressClick = (event: ReactMouseEvent) => {
    if (!pressStartedInMenuRef.current && event.detail !== 0) {
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
        ref={triggerRef}
        aria-label="더보기"
        data-room-controls=""
        inert={hidden}
        onPointerDown={stopSurfaceToggle}
        className={cn(
          "absolute top-[env(safe-area-inset-top)] right-[calc(env(safe-area-inset-right)+10px)] flex size-11 items-center justify-center transition-opacity duration-300 motion-reduce:transition-none landscape-compact:top-[calc(env(safe-area-inset-top)+10px)] regular:top-[calc(env(safe-area-inset-top)+10px)]",
          hidden ? "pointer-events-none opacity-0" : "pointer-events-auto",
          className,
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-(--session-bar-glass-bg) shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]">
          <img src={moreIcon} alt="" className="h-1 w-4.5" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        container={container}
        side="bottom"
        align="end"
        // 기본은 버튼 아래가 아니라 원의 위 끝에 붙이고, 오른쪽 끝도 원에 맞춘다(누르는 영역이 원보다 사방 6px 넓다).
        // 사이드 열 위 버튼이면 자리는 SOLO_MORE_MENU_OFFSET 여백이 정한다.
        sideOffset={aboveSideColumn ? 0 : -38}
        alignOffset={aboveSideColumn ? 0 : 6}
        onPointerDownCapture={() => {
          pressStartedInMenuRef.current = true;
        }}
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 항목 탭이 씹힌다.
        onTouchMove={(event) => event.stopPropagation()}
        className={cn(
          "min-w-50 rounded-[26px] border-0 bg-[rgba(30,34,44,0.45)] px-0 py-1.5 shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[20px]",
          aboveSideColumn && SOLO_MORE_MENU_OFFSET,
        )}
      >
        <DropdownMenuItem
          disabled={flipDisabled}
          onPointerUp={blockOpeningPressRelease}
          onClick={blockOpeningPressClick}
          onSelect={onFlipCamera}
          className={MENU_ITEM_CLASS}
        >
          카메라 전환
        </DropdownMenuItem>
        {onOpenHelp && (
          <DropdownMenuItem
            onPointerUp={blockOpeningPressRelease}
            onClick={blockOpeningPressClick}
            onSelect={onOpenHelp}
            className={MENU_ITEM_CLASS}
          >
            도움말 보기
          </DropdownMenuItem>
        )}
        {onShareInvite && (
          <DropdownMenuItem
            onPointerUp={blockOpeningPressRelease}
            onClick={blockOpeningPressClick}
            onSelect={onShareInvite}
            className={MENU_ITEM_CLASS}
          >
            초대코드 공유
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
