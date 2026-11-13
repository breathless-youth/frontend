import {
  ArrowLeftRight,
  CircleHelp,
  Clock,
  Ellipsis,
  Eye,
  EyeOff,
  Share2,
  SwitchCamera,
  type LucideIcon,
} from "lucide-react";
import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";

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

const PILL_MENU_ITEM_CLASS =
  "min-h-13 gap-3 rounded-none px-4 py-1 text-[15px] leading-5.5 font-normal text-white focus:bg-white/10";

/**
 * 싱글룸 오른쪽 위 알약 버튼
 *
 * 배경음 버튼과 더보기 버튼이 같은 모양을 쓴다. 도움말 화면의 가짜 버튼도 이 모양이다.
 */
export const SESSION_PILL_BUTTON =
  "pointer-events-auto flex h-9.5 w-14 shrink-0 items-center justify-center rounded-full border-[0.5px] border-white/22 bg-white/12 text-white backdrop-blur-[20px] backdrop-saturate-[1.8]";

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

type SessionMoreMenuProps = {
  /** 메뉴 포털 자리. 세션 화면 변수와 다크 테마를 받으려면 세션 루트를 넘긴다. */
  container: HTMLElement | null;
  flipDisabled?: boolean;
  /** 넘긴 화면에서만 카메라 전환 항목이 보인다. */
  onFlipCamera?: () => void;
  /** 넘긴 화면에서만 타이머 항목이 보인다. */
  onOpenTimer?: () => void;
  /**
   * 넘긴 화면에서만 마스코트 항목이 보인다.
   * 지금 보이는지에 따라 문구가 바뀐다.
   */
  mascotVisible?: boolean;
  onToggleMascot?: () => void;
  /** 지금 시계 보기 형식. 항목 이름이 바꿀 보기를 가리킨다. */
  clockView?: "focus" | "study";
  onToggleClockView?: () => void;
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
   * 버튼 모양
   *
   * circle은 오른쪽 위에 떠 있는 원이고 메뉴가 버튼 자리를 덮으며 열린다.
   * pill은 싱글룸 머리 줄 안에 놓이는 알약이고 메뉴가 버튼 아래로 아이콘과 함께 열린다.
   */
  variant?: "circle" | "pill";
};

/**
 * 세션 화면 오른쪽 위 더보기 버튼과 메뉴
 *
 * 메뉴가 열려 있는 동안은 호출부가 조작을 강제로 보여서 메뉴 안의 누름이 화면 탭 토글로 올라가도 상관없다.
 */
export function SessionMoreMenu({
  container,
  flipDisabled = false,
  onFlipCamera,
  onOpenTimer,
  mascotVisible = false,
  onToggleMascot,
  clockView = "focus",
  onToggleClockView,
  onShareInvite,
  onOpenHelp,
  hidden = false,
  onOpenChange,
  className,
  triggerRef,
  variant = "circle",
}: SessionMoreMenuProps) {
  const { t } = useTranslation("study-session");
  const pill = variant === "pill";
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

  const items: {
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    disabled?: boolean;
  }[] = [];
  if (onFlipCamera) {
    items.push({
      label: t("moreMenu.flipCamera"),
      icon: SwitchCamera,
      onSelect: onFlipCamera,
      disabled: flipDisabled,
    });
  }
  if (onOpenTimer) {
    items.push({ label: t("moreMenu.timer"), icon: Clock, onSelect: onOpenTimer });
  }
  if (onToggleClockView) {
    items.push({
      label: t(clockView === "focus" ? "moreMenu.viewStudy" : "moreMenu.viewFocus"),
      icon: ArrowLeftRight,
      onSelect: onToggleClockView,
    });
  }
  if (onToggleMascot) {
    items.push(
      mascotVisible
        ? { label: t("moreMenu.hideMascot"), icon: EyeOff, onSelect: onToggleMascot }
        : { label: t("moreMenu.showMascot"), icon: Eye, onSelect: onToggleMascot },
    );
  }
  if (onOpenHelp) {
    items.push({ label: t("moreMenu.help"), icon: CircleHelp, onSelect: onOpenHelp });
  }
  if (onShareInvite) {
    items.push({ label: t("moreMenu.shareInvite"), icon: Share2, onSelect: onShareInvite });
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        pressStartedInMenuRef.current = false;
        onOpenChange?.(open);
      }}
    >
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={t("moreMenu.trigger")}
        data-room-controls=""
        inert={hidden}
        onPointerDown={stopSurfaceToggle}
        className={cn(
          pill
            ? SESSION_PILL_BUTTON
            : "absolute top-[env(safe-area-inset-top)] right-[calc(env(safe-area-inset-right)+10px)] flex size-11 items-center justify-center landscape-compact:top-[calc(env(safe-area-inset-top)+10px)] regular:top-[calc(env(safe-area-inset-top)+10px)]",
          "transition-opacity duration-300 motion-reduce:transition-none",
          hidden ? "pointer-events-none opacity-0" : "pointer-events-auto",
          className,
        )}
      >
        {pill ? (
          <Ellipsis aria-hidden="true" className="size-5" strokeWidth={2} />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-(--session-bar-glass-bg) shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]">
            <img src={moreIcon} alt="" className="h-1 w-4.5" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        container={container}
        side="bottom"
        align="end"
        // 원 버튼은 버튼 아래가 아니라 원의 위 끝에 붙이고, 오른쪽 끝도 원에 맞춘다(누르는 영역이 원보다 사방 6px 넓다).
        sideOffset={pill ? 8 : -38}
        alignOffset={pill ? 0 : 6}
        onPointerDownCapture={() => {
          pressStartedInMenuRef.current = true;
        }}
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 항목 탭이 씹힌다.
        onTouchMove={(event) => event.stopPropagation()}
        className={
          pill
            ? "min-w-46 rounded-[14px] border-0 bg-[rgba(40,42,48,0.72)] p-0 shadow-[0px_12px_40px_rgba(0,0,0,0.45),inset_0px_0px_0px_0.5px_rgba(255,255,255,0.14)] backdrop-blur-[30px] backdrop-saturate-[1.8]"
            : "min-w-50 rounded-[26px] border-0 bg-[rgba(30,34,44,0.45)] px-0 py-1.5 shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[20px]"
        }
      >
        {items.map(({ label, icon: Icon, onSelect, disabled }) => (
          <DropdownMenuItem
            key={label}
            disabled={disabled}
            onPointerUp={blockOpeningPressRelease}
            onClick={blockOpeningPressClick}
            onSelect={onSelect}
            className={pill ? PILL_MENU_ITEM_CLASS : MENU_ITEM_CLASS}
          >
            {pill && <Icon aria-hidden="true" className="size-5 text-white" strokeWidth={1.5} />}
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
