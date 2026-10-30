import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { AppLockSettingsContent } from "@/features/app-lock/AppLockSettingsContent";

/** 설정 › 방해 앱 잠금 페이지 */
export function AppLockSettingsPage() {
  return (
    <main className="theme-soft-blue bg-soft-blue min-h-dvh pb-10 text-foreground">
      <ScreenBackHeader title="방해 앱 잠금" />
      <AppLockSettingsContent className="px-5 pt-3" />
    </main>
  );
}
