import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { trackOsSettingsOpened } from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";

import { PermissionToggle } from "./PermissionToggle";

type PermissionRowProps = {
  label: string;
  tooltip: string;
  tooltipLabel: string;
  /** 상태를 모르는 동안(브라우저 단독 모드·조회 실패)은 null이고 토글을 비운다. */
  granted: boolean | null;
  /** 토글의 접근성 라벨로, 허용 여부를 텍스트로 읽어 준다. */
  rowLabel: (granted: boolean) => string;
  permission?: "camera" | "mic";
};

/**
 * 설정의 OS 권한 행
 *
 * SettingsRow 없이 직접 조립한다.
 * 토글 버튼은 OS 설정을 열고 ⓘ 툴팁도 따로 버튼이라 행 전체를 <button>으로 감싸면 버튼이 중첩된다.
 * 토글은 표시 전용이다.
 */
export function PermissionRow({
  label,
  tooltip,
  tooltipLabel,
  granted,
  rowLabel,
  permission = "camera",
}: PermissionRowProps) {
  return (
    <div className="flex min-h-11 flex-row items-center justify-between gap-3 py-3.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-foreground text-base leading-4.75">{label}</span>
        <InfoTooltip label={tooltipLabel}>{tooltip}</InfoTooltip>
      </div>
      {granted !== null && (
        <button
          type="button"
          aria-label={rowLabel(granted)}
          onClick={() => {
            trackOsSettingsOpened("settings_tab");
            postToNative({ type: "open-settings", atMs: Date.now() });
          }}
          // 텍스트만으로는 높이가 19px라 세로 음수 마진으로 행 높이는 그대로 두고 버튼만 44px로 만든다.
          className="my-[-6.5px] flex min-h-11 shrink-0 items-center rounded-full focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
        >
          <PermissionToggle granted={granted} permission={permission} />
        </button>
      )}
    </div>
  );
}
