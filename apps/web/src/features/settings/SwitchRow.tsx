import { useId, useState } from "react";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Switch } from "@/components/ui/switch";
import { haptic } from "@/lib/haptics";
import { useNativeControl } from "@/lib/nativeControls";

export const ROW_CLASS_NAME = "flex min-h-11 items-center justify-between gap-3 py-3.5";
export const ROW_LABEL_CLASS_NAME = "text-foreground text-base leading-4.75";

type SwitchRowProps = {
  label: string;
  tooltip?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  /**
   * 앱이 네이티브 스위치로 바꿀 때 쓰는 id
   *
   * 라벨이 한글이라 id를 만들 수 없어 부르는 쪽이 정한다.
   * 없으면 앱에서도 웹 스위치를 그대로 쓴다.
   */
  controlId?: string;
};

/**
 * 라벨, 선택 툴팁, 스위치로 된 설정 행
 *
 * 툴팁 트리거도 버튼이라 행 전체를 label로 감싸지 않고 스위치 이름만 라벨 글자에 잇는다.
 */
export function SwitchRow({
  label,
  tooltip,
  checked,
  disabled,
  onCheckedChange,
  controlId,
}: SwitchRowProps) {
  const labelId = useId();
  // 앱 스위치는 누르는 즉시 바뀐다.
  // 누름을 처리하느라 막힌 동안 이전 값을 보내면 앱 스위치가 되돌아갔다가 처리가 끝난 뒤 다시 바뀌어서 그동안은 누른 값을 보낸다.
  const [pressed, setPressed] = useState<boolean | null>(null);
  if (pressed !== null && !disabled) {
    setPressed(null);
  }
  const { ref } = useNativeControl<HTMLButtonElement>(
    controlId === undefined
      ? null
      : {
          id: controlId,
          kind: "switch",
          on: disabled && pressed !== null ? pressed : checked,
          disabled: disabled ?? false,
          interactive: true,
          accessibilityLabel: label,
        },
    (value) => {
      // 막히기 직전에 눌려 늦게 도착한 누름은 버린다.
      if (!disabled) {
        setPressed(value === 1);
        // 웹 스위치는 Switch가 울리지만 앱 스위치 누름은 그 콜백을 거치지 않는다.
        haptic("light");
        onCheckedChange(value === 1);
      }
    },
  );

  return (
    <div className={ROW_CLASS_NAME}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span id={labelId} className={ROW_LABEL_CLASS_NAME}>
          {label}
        </span>
        {tooltip !== undefined && <InfoTooltip label={`${label} 안내`}>{tooltip}</InfoTooltip>}
      </div>
      <Switch
        ref={ref}
        size="settings"
        aria-labelledby={labelId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
