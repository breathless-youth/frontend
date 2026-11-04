import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Ellipsis, Volume2 } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { GROUP_ROOM_ANALYTICS_MASK } from "../groupRoomAnalyticsMask";
import { memberMenuCollisionPadding } from "../memberMenuCollision";

const MENU_ITEM_CLASS =
  "min-h-11 rounded-none px-5 py-0 text-[17px] leading-5.5 font-normal text-white focus:bg-white/10";
const DANGER_ITEM_CLASS = "text-(--session-exit-bg) focus:text-(--session-exit-bg)";

/** 슬라이더 한 칸이 5%라 소리를 끄지 않고도 아주 작게 둘 수 있다. */
const VOLUME_STEP = 5;

/**
 * 공부방 다른 멤버의 메뉴 버튼과 멤버 메뉴
 *
 * 타일 오른쪽 아래의 흰 점 세 개로만 열고, 타일을 누르는 것은 지금처럼 조작 표시를 켜고 끈다.
 * 메뉴는 세션 화면에 포털로 띄워 타일이 자르지 않고, 가로에서는 버튼 위로 펼친다.
 * 음량과 소리 끄기는 이 기기에서만 먹히고, 신고와 내보내기는 메뉴가 닫히고 메뉴 버튼에 포커스가 돌아온 뒤에 넘겨 그 화면이 닫힐 때 메뉴 버튼으로 돌아간다.
 * 메뉴 버튼과 음량의 aria-label에는 닉네임이 들어서 Sentry 클릭 기록이 컴포넌트 이름을 적게 한다.
 */
export function RoomMemberMenu({
  nickname,
  volume,
  muted,
  canKick,
  placement,
  open,
  container,
  onOpen,
  onClose,
  onVolumeChange,
  onToggleMute,
  onReport,
  onKick,
}: {
  nickname: string;
  /** 0에서 1 사이 음량 */
  volume: number;
  muted: boolean;
  /** 그룹장에게만 그룹에서 내보내기가 있다. */
  canKick: boolean;
  placement: "below" | "above";
  open: boolean;
  /** 메뉴 포털 자리이고, 세션 화면 변수와 어두운 테마를 받으려면 세션 루트를 넘긴다. */
  container: HTMLElement | null;
  onOpen: () => void;
  onClose: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onReport: () => void;
  onKick: () => void;
}) {
  const { t } = useTranslation("live-room");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chosen = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpen();
        } else {
          onClose();
        }
      }}
    >
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={t("roomMemberMenu.aria.trigger", { nickname })}
        data-sentry-element="RoomMemberMenu"
        // 화면 탭은 조작을 숨기고 보이는 토글이라 메뉴 버튼 누름이 거기까지 올라가지 않게 끊는다.
        onPointerDown={(event) => event.stopPropagation()}
        className="flex size-11 items-center justify-center text-white focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        <Ellipsis
          aria-hidden="true"
          className="size-6 drop-shadow-[0_1px_3px_rgb(0_0_0/0.45)]"
          strokeWidth={2.6}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        container={container}
        side={placement === "above" ? "top" : "bottom"}
        align="end"
        collisionPadding={memberMenuCollisionPadding(placement)}
        data-placement={placement}
        {...GROUP_ROOM_ANALYTICS_MASK}
        onCloseAutoFocus={(event) => {
          const action = chosen.current;
          chosen.current = null;
          if (action === null) {
            return;
          }
          // 고른 일이 여는 화면은 닫힐 때 지금 포커스가 있던 곳으로 돌아가서 메뉴 버튼에 먼저 포커스를 둔다.
          event.preventDefault();
          triggerRef.current?.focus();
          action();
        }}
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 항목 탭이 씹힌다.
        onTouchMove={(event) => event.stopPropagation()}
        className="min-w-60 rounded-[26px] border-0 bg-(--session-bar-glass-bg) px-0 py-1.5 shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[20px]"
      >
        <p className="truncate px-5 pt-2 pb-1 text-[15px] leading-5 font-bold text-white">
          {nickname}
        </p>
        <div className="flex min-h-11 items-center gap-2.5 px-5">
          <Volume2 aria-hidden="true" className="size-5 shrink-0 text-white/72" />
          {/* 메뉴는 Tab을 막고 항목 사이만 화살표로 오가서 슬라이더도 항목으로 넣어야 키보드로 닿는다.
              항목 모양을 입히는 공용 부품 대신 원본 항목을 써서 슬라이더 역할과 모양을 그대로 둔다. */}
          <DropdownMenuPrimitive.Item
            asChild
            role="slider"
            textValue={t("roomMemberMenu.volume")}
            // 음량을 바꿔도 메뉴는 닫지 않는다.
            onSelect={(event) => event.preventDefault()}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={VOLUME_STEP}
              value={Math.round(volume * 100)}
              aria-label={t("roomMemberMenu.aria.volume", { nickname })}
              data-sentry-element="RoomMemberVolume"
              onChange={(event) => onVolumeChange(Number(event.currentTarget.value) / 100)}
              className="h-11 w-full min-w-0 accent-(--state-focus) focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
            />
          </DropdownMenuPrimitive.Item>
        </div>
        <DropdownMenuItem onSelect={onToggleMute} className={MENU_ITEM_CLASS}>
          {muted ? t("roomMemberMenu.unmute") : t("roomMemberMenu.mute")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            chosen.current = onReport;
          }}
          className={cn(MENU_ITEM_CLASS, DANGER_ITEM_CLASS)}
        >
          {t("roomMemberMenu.report")}
        </DropdownMenuItem>
        {canKick && (
          <DropdownMenuItem
            onSelect={() => {
              chosen.current = onKick;
            }}
            className={cn(MENU_ITEM_CLASS, DANGER_ITEM_CLASS)}
          >
            {t("roomMemberMenu.kick")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
