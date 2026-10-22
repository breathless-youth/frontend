import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { formatLockedAppsSummary } from "@/features/app-lock/appLockSummary";
import { openAppLockBatteryGuide } from "@/features/app-lock/nativeAppLock";
import { useAppLockSettings } from "@/features/app-lock/useAppLockSettings";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { SwitchRow } from "@/features/settings/SwitchRow";

const DESCRIPTION = ["공부를 시작하면 잠기고, 공부를 끝내면 풀려요."];

/**
 * 설정 › 방해 앱 잠금 페이지
 *
 * 켜고 끄기와 잠글 앱 고르기를 하고, Android 앱에서는 배터리 설정 안내를 다시 연다.
 * 실제 잠금은 공부를 시작할 때 세션 화면이 요청한다.
 * 잠글 앱 목록은 앱 이름을 웹에 넘기지 않으려고 네이티브 모달로 열고 여기에는 개수만 돌아온다.
 */
export function AppLockSettingsPage() {
  const { enabled, appCount, categoryCount, busy, batteryGuide, toggle, pick } =
    useAppLockSettings();

  return (
    <main className="theme-soft-blue bg-soft-blue min-h-dvh pb-10 text-foreground">
      <ScreenBackHeader title="방해 앱 잠금" />

      <div className="flex flex-col gap-5 px-5 pt-3">
        <SettingsSection>
          <SwitchRow
            label="방해 앱 잠금"
            controlId="switch-app-lock"
            tooltip="접근 가능 정보: 잠긴 앱 개수, 잠금 설정 활성화 여부"
            checked={enabled}
            disabled={busy}
            onCheckedChange={(next) => void toggle(next)}
          />
          {enabled && (
            <SettingsRow
              label="잠긴 앱"
              trailing={{
                kind: "valueChevron",
                value: formatLockedAppsSummary(appCount, categoryCount),
              }}
              onPress={() => {
                if (!busy) void pick();
              }}
            />
          )}
          {batteryGuide && (
            <SettingsRow
              label="배터리 설정 안내"
              trailing={{ kind: "chevron" }}
              onPress={openAppLockBatteryGuide}
            />
          )}
        </SettingsSection>

        <section className="bg-bg-layer-2 rounded-xl p-4">
          <h2 className="text-foreground text-sm leading-5 font-semibold">기능 설명</h2>
          <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-[13px] leading-5">
            {DESCRIPTION.map((line) => (
              <li key={line} className="flex gap-1.5">
                <span aria-hidden="true">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
