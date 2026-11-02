import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Plus, RectangleEllipsis } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { CREATE_ROOM_LIMIT_COPY } from "../model/limits";

// 채운 파란 버튼 바로 바깥의 파란 링은 묻히므로 바탕색 틈을 두고 두른다.
const FAB_CLASS =
  "flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sb-cta focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

/** 버튼 오른쪽 끝을 본문 열에 맞추고 탭 바 바로 위에 띄운다. */
const FAB_SLOT_CLASS = "px-5 pb-[calc(var(--tab-bar-reserve)+16px)] page-width";

const MENU_ITEM_CLASS =
  "flex min-h-12 w-full items-center gap-2.5 rounded-[14px] px-3 py-2.25 text-left text-[15px] leading-5 font-bold text-foreground outline-none focus-visible:bg-bg-layer-2 active:bg-bg-layer-2 aria-disabled:text-text-disabled aria-disabled:active:bg-transparent";

/**
 * 메뉴 안 화살표 이동
 *
 * 메뉴가 열리면 메뉴 자체에 포커스가 있어 아래 화살표는 첫 항목으로, 위 화살표는 마지막 항목으로 간다.
 */
function nextItemIndex(key: string, current: number, count: number): number | null {
  const last = count - 1;
  switch (key) {
    case "ArrowDown":
      return current >= last ? 0 : current + 1;
    case "ArrowUp":
      return current <= 0 ? last : current - 1;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/**
 * 그룹 탭 오른쪽 아래의 `+` 버튼과 메뉴
 *
 * 목록을 내려도 탭 바 바로 위에 있어야 해서 하단 고정 금지 규칙의 예외로 `fixed`를 쓴다.
 * 열리면 화면 전체 덮개가 모달 표시를 달아 앱이 탭 바를 딤 상태로 두고, 같은 자리에 닫기 버튼을 그린다.
 * 터치로 연 메뉴의 첫 항목에 포커스 링이 남지 않게 열 때는 메뉴 자체에 포커스를 둔다.
 * 그룹을 더 만들 수 없으면 그룹 만들기를 흐리게 두되 이유를 읽을 수 있게 누를 수 있는 채로 남기고 아무 일도 하지 않는다.
 */
export function RoomFab({
  canCreate,
  onCreate,
  onJoinWithCode,
  defaultOpen = false,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onJoinWithCode: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const menuRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const next = nextItemIndex(
      event.key,
      items.findIndex((item) => item === document.activeElement),
      items.length,
    );
    if (next === null) {
      return;
    }
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end",
          FAB_SLOT_CLASS,
        )}
      >
        <DialogTrigger
          aria-label="그룹 만들기와 초대코드로 참여"
          className={cn(FAB_CLASS, "pointer-events-auto")}
        >
          <Plus aria-hidden="true" size={24} strokeWidth={2.4} />
        </DialogTrigger>
      </div>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          // 공용 DialogContent와 같은 이유로 직접 단다.
          // 앱 탭 바 차단 감지가 이 속성만 본다.
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            menuRef.current?.focus();
          }}
          // 메뉴와 닫기 버튼 밖의 빈 곳은 모두 덮개라 이곳을 누르면 닫는다.
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
          className="theme-soft-blue fixed inset-0 z-50 flex flex-col justify-end outline-none duration-200 ease-overlay data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <DialogTitle className="sr-only">그룹 메뉴</DialogTitle>
          {/* 빈 곳의 누름이 덮개까지 내려가도록 자리 상자는 누름을 받지 않고 메뉴와 버튼만 받는다. */}
          <div
            className={cn(
              "pointer-events-none flex flex-col items-end gap-4 *:pointer-events-auto",
              FAB_SLOT_CLASS,
            )}
          >
            <div
              ref={menuRef}
              role="menu"
              aria-label="그룹 메뉴"
              tabIndex={-1}
              onKeyDown={moveFocus}
              className="flex min-w-52 flex-col rounded-xl bg-muted p-1.5 shadow-sb-card outline-none"
            >
              <button
                type="button"
                role="menuitem"
                aria-label="그룹 만들기"
                aria-disabled={canCreate ? undefined : true}
                aria-describedby={canCreate ? undefined : reasonId}
                onClick={() => {
                  if (canCreate) {
                    choose(onCreate);
                  }
                }}
                className={MENU_ITEM_CLASS}
              >
                <Plus aria-hidden="true" size={16} strokeWidth={2.2} className="shrink-0" />
                <span className="flex flex-col gap-0.5">
                  그룹 만들기
                  {!canCreate && (
                    <span id={reasonId} className="text-xs leading-4 font-medium text-state-pause">
                      {CREATE_ROOM_LIMIT_COPY}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(onJoinWithCode)}
                className={MENU_ITEM_CLASS}
              >
                <RectangleEllipsis aria-hidden="true" size={16} className="shrink-0" />
                초대코드로 참여
              </button>
            </div>
            <DialogClose aria-label="그룹 메뉴 닫기" className={FAB_CLASS}>
              <Plus aria-hidden="true" size={24} strokeWidth={2.4} className="rotate-45" />
            </DialogClose>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
