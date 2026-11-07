import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  Ellipsis,
  FileText,
  Inbox,
  LogOut,
  type LucideIcon,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { Fragment, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { RoomMenuItem } from "../model/roomMenu";
import { GROUP_MENU_CONTENT_CLASS, GROUP_MENU_ITEM_CLASS } from "./groupMenuClass";

type LeaveItem = Extract<RoomMenuItem, { kind: "leave" }>;

const ITEM_ICON: Record<Exclude<RoomMenuItem, LeaveItem>["kind"], LucideIcon> = {
  requests: Inbox,
  invite: UserPlus,
  manage_members: Users,
  view_members: Users,
  settings: Settings,
  view_intro: FileText,
};

/**
 * 그룹 홈 머리 줄의 그룹 메뉴 버튼과 메뉴
 *
 * 항목과 나가기 안내는 판단 모듈이 정하고 여기서는 그리기만 한다.
 * 메뉴 밖을 누르거나 Esc를 누르면 닫히고, 항목을 고르면 닫은 뒤에 그 종류를 넘긴다.
 */
export function RoomMenu({
  items,
  onSelect,
  onOpen,
  defaultOpen = false,
}: {
  items: RoomMenuItem[];
  onSelect: (kind: RoomMenuItem["kind"]) => void;
  /** 메뉴가 열릴 때 부르고, 항목이 쓸 값을 고르기 전에 새로 받을 때 쓴다. */
  onOpen?: () => void;
  /** 개발용 화면 모음에서 메뉴가 열린 모습을 바로 보려고 쓴다. */
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation("group-room");
  const chosen = useRef<RoomMenuItem["kind"] | null>(null);
  const choose = (kind: RoomMenuItem["kind"]) => {
    chosen.current = kind;
  };
  return (
    <DropdownMenu
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        if (open) onOpen?.();
      }}
    >
      <DropdownMenuTrigger
        aria-label={t("roomMenuButton.aria.label")}
        className="flex size-11 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none data-[state=open]:bg-border"
      >
        <Ellipsis aria-hidden="true" size={22} strokeWidth={2.4} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // 고른 항목이 확인 창을 열면 그 창이 닫힐 때 돌아갈 곳이 메뉴 버튼이어야 한다.
        // 고른 일을 메뉴가 닫힌 뒤 이 처리기에서 넘기고 기본 동작은 막지 않아서, 메뉴가 포커스를 메뉴 버튼에 돌려준 다음에 확인 창이 그려진다.
        onCloseAutoFocus={() => {
          const kind = chosen.current;
          chosen.current = null;
          if (kind !== null) onSelect(kind);
        }}
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 탭이 씹히므로, touchmove를 잠금까지 올려 보내지 않고 끌어서 밀릴 것도 없게 터치 팬을 끈다.
        onTouchMove={(event) => event.stopPropagation()}
        className={cn(GROUP_MENU_CONTENT_CLASS, "min-w-62")}
      >
        {items.map((item) =>
          item.kind === "leave" ? (
            <Fragment key={item.kind}>
              <DropdownMenuPrimitive.Separator className="mx-3 my-1 h-px bg-border" />
              <LeaveMenuItem item={item} onSelect={choose} />
            </Fragment>
          ) : (
            <MenuItem key={item.kind} item={item} onSelect={choose} />
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuItem({
  item,
  onSelect,
}: {
  item: Exclude<RoomMenuItem, LeaveItem>;
  onSelect: (kind: RoomMenuItem["kind"]) => void;
}) {
  const Icon = ITEM_ICON[item.kind];
  return (
    <DropdownMenuItem onSelect={() => onSelect(item.kind)} className={GROUP_MENU_ITEM_CLASS}>
      <Icon aria-hidden="true" size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.kind === "requests" && item.badge > 0 && (
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs leading-4 font-bold text-primary-foreground tabular-nums">
          {item.badge}
        </span>
      )}
    </DropdownMenuItem>
  );
}

/**
 * 그룹 나가기 항목
 *
 * 나갈 수 없는 그룹장에게는 이유를 항목 아래에 두어 항목의 설명으로 읽히게 한다.
 */
function LeaveMenuItem({
  item,
  onSelect,
}: {
  item: LeaveItem;
  onSelect: (kind: RoomMenuItem["kind"]) => void;
}) {
  const noteId = useId();
  return (
    <DropdownMenuItem
      aria-label={item.label}
      aria-describedby={item.note === null ? undefined : noteId}
      onSelect={() => onSelect(item.kind)}
      className={cn(GROUP_MENU_ITEM_CLASS, "items-start")}
    >
      <LogOut aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-feedback-danger" />
      <span className="flex min-w-0 flex-col">
        <span className="text-feedback-danger">{item.label}</span>
        {item.note !== null && (
          <span id={noteId} className="text-xs leading-4.5 font-normal text-muted-foreground">
            {item.note}
          </span>
        )}
      </span>
    </DropdownMenuItem>
  );
}
