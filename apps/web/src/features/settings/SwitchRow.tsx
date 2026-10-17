import { useId } from "react";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Switch } from "@/components/ui/switch";

export const ROW_CLASS_NAME = "flex min-h-11 items-center justify-between gap-3 py-[14px]";
export const ROW_LABEL_CLASS_NAME = "text-foreground text-base leading-[19px]";

type SwitchRowProps = {
  label: string;
  tooltip?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * 라벨, 선택 툴팁, 스위치로 된 설정 행
 *
 * 툴팁 트리거도 버튼이라 행 전체를 label로 감싸지 않고 스위치 이름만 라벨 글자에 잇는다.
 */
export function SwitchRow({ label, tooltip, checked, disabled, onCheckedChange }: SwitchRowProps) {
  const labelId = useId();

  return (
    <div className={ROW_CLASS_NAME}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span id={labelId} className={ROW_LABEL_CLASS_NAME}>
          {label}
        </span>
        {tooltip !== undefined && <InfoTooltip label={`${label} 안내`}>{tooltip}</InfoTooltip>}
      </div>
      <Switch
        size="settings"
        aria-labelledby={labelId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
