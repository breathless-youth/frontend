import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { formatLockedAppsSummary } from "@/features/app-lock/appLockSummary";
import { useAppLockSettings } from "@/features/app-lock/useAppLockSettings";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { SwitchRow } from "@/features/settings/SwitchRow";

const DESCRIPTION = [
  "공부를 시작하면 잠기고, 공부를 끝내면 풀려요.",
  "일시정지 중에도 잠겨 있어요.",
];

/**
 * 설정 › 방해 앱 잠금 페이지
 *
 * 켜고 끄기와 잠글 앱 고르기만 한다.
 * 실제 잠금은 공부를 시작할 때 세션 화면이 요청한다.
 * 잠글 앱 목록은 iOS 화면이라 네이티브 모달로 열고 여기에는 개수만 돌아온다.
 */
export function AppLockSettingsPage() {
  const { enabled, appCount, categoryCount, busy, toggle, pick } = useAppLockSettings();

  return (
    <main className="theme-soft-blue bg-soft-blue min-h-dvh pb-10 text-foreground">
      <ScreenBackHeader title="방해 앱 잠금" />

      <div className="flex flex-col gap-5 px-5 pt-3">
        <SettingsSection>
          <SwitchRow
            label="방해 앱 잠금"
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
