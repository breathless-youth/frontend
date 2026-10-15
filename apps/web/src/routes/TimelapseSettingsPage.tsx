import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { daysUntil, formatDday } from "@/features/home/ddayFormat";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { TimelapsePreview } from "@/features/timelapse/TimelapsePreview";
import {
  TIMELAPSE_INFO_KEYS,
  type TimelapseAspect,
  type TimelapseInfoKey,
  type TimelapseSettings,
} from "@/features/timelapse/timelapseSettings";
import { useTimelapseSettings } from "@/features/timelapse/useTimelapseSettings";
import { trackTimelapseSettingChanged, type TimelapseSettingEventKey } from "@/lib/amplitude";
import { ddayQuery } from "@/lib/ddayQueries";
import { useUserId } from "@/lib/userId";

const INFO_LABELS: Record<TimelapseInfoKey, string> = {
  faceMask: "얼굴 가림",
  flowBar: "집중 흐름 바",
  date: "날짜",
  focusTime: "순공 시간",
  focusRate: "집중률",
  dday: "D-Day",
  streak: "연속 공부",
};

const INFO_EVENT_KEYS: Record<TimelapseInfoKey, TimelapseSettingEventKey> = {
  faceMask: "face_mask",
  flowBar: "flow_bar",
  date: "date",
  focusTime: "focus_time",
  focusRate: "focus_rate",
  dday: "dday",
  streak: "streak",
};

const ASPECTS: readonly { value: TimelapseAspect; label: string }[] = [
  { value: "9:16", label: "세로 9:16" },
  { value: "16:9", label: "가로 16:9" },
];

const ROW_CLASS_NAME = "flex min-h-11 items-center justify-between gap-3 py-[14px]";
const ROW_LABEL_CLASS_NAME = "text-foreground text-base leading-[19px]";

type SwitchRowProps = {
  label: string;
  tooltip?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * 라벨, 선택 툴팁, 스위치로 된 설정 행
 *
 * 툴팁 트리거도 버튼이라 행 전체를 label로 감싸지 않고 스위치 이름만 라벨 글자에 잇는다.
 */
function SwitchRow({ label, tooltip, checked, onCheckedChange }: SwitchRowProps) {
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
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/**
 * 설정 › 타임랩스 페이지
 *
 * 값은 이 기기의 localStorage에 저장되고 세션 웹뷰가 시작할 때 한 번 읽는다.
 * 저장을 끄면 나머지 설정은 쓰이지 않으므로 숨긴다.
 */
export function TimelapseSettingsPage() {
  const [settings, update] = useTimelapseSettings();
  const userId = useUserId();
  const dday = useQuery({ ...ddayQuery(userId ?? 0), enabled: userId !== null });
  // 미설정이 확인됐을 때만 문구로 바꾼다. 불러오는 중이거나 실패하면 스위치를 둔다.
  // 재조회가 실패해도 이전 응답의 null이 data에 남으므로 status로 성공을 확인한다.
  const ddayMissing = dday.isSuccess && dday.data === null;
  // 재조회가 실패해도 이전 D-Day가 data에 남으므로 마지막 조회가 성공했을 때만 실제 값을 쓴다.
  const ddayLabel =
    dday.isSuccess && dday.data !== null
      ? `${formatDday(daysUntil(dday.data.targetDate))} · ${dday.data.title}`
      : undefined;
  const aspectLabelId = useId();

  const change = (
    next: TimelapseSettings,
    setting: TimelapseSettingEventKey,
    value: boolean | TimelapseAspect,
  ) => {
    update(next);
    trackTimelapseSettingChanged({ setting, value });
  };

  return (
    <main className="theme-soft-blue bg-soft-blue min-h-dvh pb-10 text-foreground">
      <ScreenBackHeader title="타임랩스" />

      {settings !== null && (
        <div className="flex flex-col gap-5 px-5 pt-3">
          <SettingsSection>
            <SwitchRow
              label="타임랩스 저장"
              tooltip="기기 내에만 최대 7일, 7개까지 보관돼요."
              checked={settings.enabled}
              onCheckedChange={(enabled) => change({ ...settings, enabled }, "enabled", enabled)}
            />
          </SettingsSection>

          {settings.enabled && (
            <>
              <div>
                <p
                  id={aspectLabelId}
                  className="text-text-tertiary mb-1.5 px-1 text-[13px] leading-[15px] font-medium"
                >
                  영상 비율
                </p>
                <ToggleGroup
                  type="single"
                  aria-labelledby={aspectLabelId}
                  value={settings.aspect}
                  // 선택된 칸을 다시 누르면 빈 문자열이 온다. 비율은 늘 하나가 골라져 있어야 해서 무시한다.
                  onValueChange={(value) => {
                    if (value === "" || value === settings.aspect) return;
                    const aspect = value as TimelapseAspect;
                    change({ ...settings, aspect }, "aspect", aspect);
                  }}
                  className="bg-bg-control-track flex-nowrap gap-0.5 rounded-[12px] p-1"
                >
                  {ASPECTS.map((aspect) => (
                    <ToggleGroupItem
                      key={aspect.value}
                      value={aspect.value}
                      className="text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground h-auto flex-1 justify-center rounded-[9px] border-0 bg-transparent px-0 py-[9px] text-sm leading-[17px] font-normal data-[state=on]:font-bold data-[state=on]:shadow-[var(--shadow-segment-thumb)]"
                    >
                      {aspect.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <SettingsSection label="미리보기">
                <div className="flex justify-center py-4">
                  {/* WebKit은 고정 크기에서 aspect-ratio로 클래스만 바뀌면 높이를 0으로 남겨서 비율이 바뀔 때 새로 그린다. */}
                  <TimelapsePreview
                    key={settings.aspect}
                    aspect={settings.aspect}
                    // D-Day가 없으면 영상에도 들어가지 않으므로 켜 둔 값이 남아 있어도 그리지 않는다.
                    info={{ ...settings.info, dday: settings.info.dday && !ddayMissing }}
                    ddayLabel={ddayLabel}
                  />
                </div>
              </SettingsSection>

              <SettingsSection label="영상에 넣을 정보">
                {TIMELAPSE_INFO_KEYS.map((key) =>
                  key === "dday" && ddayMissing ? (
                    <div key={key} className={ROW_CLASS_NAME}>
                      <span className={ROW_LABEL_CLASS_NAME}>{INFO_LABELS.dday}</span>
                      <span className="text-text-tertiary text-sm leading-[18px]">
                        디데이 설정 필요
                      </span>
                    </div>
                  ) : (
                    <SwitchRow
                      key={key}
                      label={INFO_LABELS[key]}
                      tooltip={key === "faceMask" ? "처음 인식된 얼굴만 가려요." : undefined}
                      checked={settings.info[key]}
                      onCheckedChange={(checked) =>
                        change(
                          { ...settings, info: { ...settings.info, [key]: checked } },
                          INFO_EVENT_KEYS[key],
                          checked,
                        )
                      }
                    />
                  ),
                )}
              </SettingsSection>
            </>
          )}
        </div>
      )}
    </main>
  );
}
