import { useId } from "react";

import { Button } from "@/components/ui/button";
import { CharCount, isCharCountVisible } from "@/components/ui/char-count";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SUBJECT_SHEET_COPY } from "@/features/study-session/sessionCopy";
import { useInlineNameEdit } from "@/features/study-session/subjectInteractions";
import { cn } from "@/lib/utils";

/** 글자 수는 한도의 80%부터 보인다. */
const COUNT_SHOW_FROM = 0.8;

/**
 * 이름 입력과 `완료` 버튼
 *
 * 추가와 이름 변경이 같이 쓴다.
 * 입력 규칙은 과목 시트와 같은 `useInlineNameEdit`를 따른다.
 */
export function InlineEditor({
  initial,
  maxLength,
  placeholder,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initial?: string;
  maxLength: number;
  placeholder: string;
  ariaLabel: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const { value, setValue, commit, handleKeyDown, over } = useInlineNameEdit({
    initial,
    maxLength,
    onCommit,
    onCancel,
  });
  const countId = useId();
  const countVisible = isCharCountVisible(value.length, maxLength, COUNT_SHOW_FROM);
  return (
    <div
      className="flex w-full flex-col gap-1 py-0.5"
      // 입력 안에서의 드래그가 날짜 넘김 스와이프로 읽히지 않게 한다.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex w-full items-center gap-1.5">
        <Input
          // 사용자가 방금 누른 자리에 열리는 입력이라 autoFocus가 흐름을 끊지 않는다.
          autoFocus
          aria-label={ariaLabel}
          aria-describedby={countVisible ? countId : undefined}
          value={value}
          placeholder={placeholder}
          enterKeyHint="done"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          // 공용 입력(높이 52)을 플래너 줄 높이에 맞춘다. 테두리가 이미 브랜드색이라 포커스 링은 겹쳐 그리지 않는다.
          className="h-8 min-w-0 flex-1 rounded-sm border-primary bg-bg-layer-2 px-2 text-sm leading-4.5 font-medium placeholder:text-muted-foreground focus-visible:ring-0"
        />
        <Button
          disabled={over}
          // blur보다 먼저 잡아 두 번 확정되지 않게 한다.
          onPointerDown={(event) => event.preventDefault()}
          onClick={commit}
          className="h-8 shrink-0 rounded-sm px-2.25 py-0 text-xs leading-4 font-semibold"
        >
          {SUBJECT_SHEET_COPY.done}
        </Button>
      </div>
      <CharCount
        id={countId}
        length={value.length}
        max={maxLength}
        showFrom={COUNT_SHOW_FROM}
        overMessage={`${maxLength}자까지 쓸 수 있어요`}
        className="px-0.5"
      />
    </div>
  );
}

const ROW_MENU_ITEM_CLASS = "h-10 rounded-[10px] px-3 py-0 text-sm leading-4.5 font-medium";

/**
 * 길게 누르기 메뉴
 *
 * 누른 행 바로 아래에 뜬다.
 * 공용 DropdownMenu를 쓰지만 여는 시점은 호출부의 길게 누르기가 정하고, 열려 있을 때만 그린다.
 * 바깥을 누르면 닫히는 것과 키보드 이동은 DropdownMenu가 맡는다.
 */
export function RowMenu({
  onRename,
  onRemove,
  onDismiss,
}: {
  onRename: () => void;
  onRemove: () => void;
  onDismiss: () => void;
}) {
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onDismiss();
        }
      }}
    >
      {/* 메뉴가 붙을 자리로, 행을 덮는 보이지 않는 기준점이다. */}
      {/* 누름은 행의 동작이 처리하므로 여기서는 받지 않는다. */}
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none absolute inset-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        alignOffset={14}
        sideOffset={0}
        // 길게 누른 손가락 밑으로 뒤집혀 올라오지 않게 늘 행 아래에 둔다.
        avoidCollisions={false}
        // 길게 누른 손가락을 뗄 때 행이 포커스를 가져가도 닫지 않는다.
        onFocusOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // 포털이 body로 나가므로 테마를 다시 단다. 명세가 모션을 더하지 않기로 해서 등장 애니메이션은 끈다.
        className="theme-soft-blue w-37.5 min-w-0 rounded-[14px] p-1.5 shadow-[0_12px_16px_0_rgba(15,23,42,0.18)] data-[state=open]:animate-none"
      >
        <DropdownMenuItem
          // 누른 채 메뉴 위로 끌고 와 떼는 것만으로는 고르지 않고, 항목을 눌렀다 떼야 고른다.
          onPointerUp={(event) => event.preventDefault()}
          onSelect={onRename}
          className={ROW_MENU_ITEM_CLASS}
        >
          이름 변경
        </DropdownMenuItem>
        <DropdownMenuItem
          onPointerUp={(event) => event.preventDefault()}
          onSelect={onRemove}
          className={cn(ROW_MENU_ITEM_CLASS, "text-feedback-danger")}
        >
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
