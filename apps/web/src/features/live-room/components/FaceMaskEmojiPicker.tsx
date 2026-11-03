import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import type { FaceMaskEmoji } from "../faceMaskSettings";

type FaceMaskEmojiPickerProps = {
  emojis: readonly FaceMaskEmoji[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
  /** 바깥 여백은 놓이는 자리마다 달라 부르는 쪽이 정한다. */
  className?: string;
};

function revealSelected(item: HTMLButtonElement | null) {
  item?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

/**
 * 가림 이모지 한 줄
 *
 * 한 줄을 유지해 높이를 고정하고, 넘치는 이모지는 옆으로 넘겨 본다.
 * 위아래 여백은 포커스 링이 잘리지 않게 둔다.
 */
export function FaceMaskEmojiPicker({
  emojis,
  value,
  disabled,
  onChange,
  className,
}: FaceMaskEmojiPickerProps) {
  return (
    <ToggleGroup
      type="single"
      aria-label="가림 이모지"
      disabled={disabled}
      value={value}
      // 같은 이모지를 다시 누르면 빈 값이 오는데, 가리는 동안에는 항상 하나가 골라져 있어야 해서 무시한다.
      onValueChange={(id) => {
        if (id !== "") onChange(id);
      }}
      className={cn(
        "flex-nowrap gap-2 overflow-x-auto py-0.5 pl-0.5 -ml-0.5 [scrollbar-width:none]",
        className,
      )}
    >
      {emojis.map((emoji) => (
        <ToggleGroupItem
          key={emoji.id}
          ref={emoji.id === value ? revealSelected : undefined}
          value={emoji.id}
          aria-label={emoji.label}
          className="size-11 shrink-0 justify-center rounded-md p-1.5 before:content-none disabled:opacity-40 data-[state=on]:border-primary data-[state=on]:bg-primary/15"
        >
          <img src={emoji.url} alt="" className="size-full object-contain" draggable={false} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
