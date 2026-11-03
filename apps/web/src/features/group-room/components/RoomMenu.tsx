import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Ellipsis, Inbox, LogOut, type LucideIcon, Settings, UserPlus, Users } from "lucide-react";
import { Fragment, useId } from "react";

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
};

/**
 * 그룹 홈 머리 줄의 그룹 메뉴 버튼과 메뉴
 *
 * 항목과 나가기 안내는 판단 모듈이 정하고 여기서는 그리기만 한다.
 * 메뉴 밖을 누르거나 Esc를 누르면 닫히고, 항목을 고르면 닫으면서 그 종류를 넘긴다.
 */
export function RoomMenu({
  items,
  onSelect,
  defaultOpen = false,
}: {
  items: RoomMenuItem[];
  onSelect: (kind: RoomMenuItem["kind"]) => void;
  /** 개발용 화면 모음에서 메뉴가 열린 모습을 바로 보려고 쓴다. */
  defaultOpen?: boolean;
}) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        aria-label="그룹 메뉴"
        className="flex size-11 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none data-[state=open]:bg-border"
      >
        <Ellipsis aria-hidden="true" size={22} strokeWidth={2.4} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 탭이 씹히므로, touchmove를 잠금까지 올려 보내지 않고 끌어서 밀릴 것도 없게 터치 팬을 끈다.
        onTouchMove={(event) => event.stopPropagation()}
        className={cn(GROUP_MENU_CONTENT_CLASS, "min-w-62")}
      >
        {items.map((item) =>
          item.kind === "leave" ? (
            <Fragment key={item.kind}>
              <DropdownMenuPrimitive.Separator className="mx-3 my-1 h-px bg-border" />
              <LeaveMenuItem item={item} onSelect={onSelect} />
            </Fragment>
          ) : (
            <MenuItem key={item.kind} item={item} onSelect={onSelect} />
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
