import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";

import { useNativeShellClass } from "@/lib/nativeShell";
import { useNativeTabBarSync } from "@/lib/nativeTabBar";
import { ContactPage } from "@/routes/ContactPage";
import { HomePage } from "@/routes/HomePage";
import { HomeTabPage } from "@/routes/HomeTabPage";
import { OnboardingGuidePage } from "@/routes/OnboardingGuidePage";
import { PrivacyPage } from "@/routes/PrivacyPage";
import { RecordsPage } from "@/routes/RecordsPage";
import { ResultPage } from "@/routes/ResultPage";
import { RoomPage } from "@/routes/RoomPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { TermsPage } from "@/routes/TermsPage";

/**
 * S3-1~S3-8(세션)은 8개의 라우트가 아니라 `/room/:id` **하나**가 갖는 프레젠테이션 상태다
 * (종료 확인은 모달, 자동 종료 안내는 같은 라우트의 상태).
 * **S4(공부 결과)만 별도 라우트**이며 `/room/:id` 형제 경로로 둔다 — 세션이 끝난 뒤의 화면이라
 * 룸 컨텍스트에 속하고, 뒤로 가기로 살아 있는 세션에 되돌아가지 않는다(`replace` 이동).
 */
/**
 * 서버 상태는 react-query가 관리한다(모바일과 동일 표준 — BY-329에서 도입).
 * 기본값 유지: `refetchOnWindowFocus`가 웹뷰 재노출 시 stale 쿼리를 재조회한다
 * (모바일 `useFocusEffect` invalidate의 웹 대응).
 */
const queryClient = new QueryClient();

export function App() {
  // 전체 화면 라우트에서 네이티브 탭 바를 감춘다 — 웹 라우팅은 네이티브 스택을 건너지 않으므로
  // 알려주지 않으면 탭 바가 그대로 남는다(`lib/nativeTabBar.ts`).
  useNativeTabBarSync();
  // 웹뷰 안에서만 페이지 드래그·길게 눌러 선택을 막는다(`lib/nativeShell.ts`).
  useNativeShellClass();

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/room/:id/result" element={<ResultPage />} />
        <Route path="/home" element={<HomeTabPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* BY-331: 설정 하위 화면 — 탭 바 없는 전체 화면 스택 라우트. */}
        <Route path="/onboarding-guide" element={<OnboardingGuidePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    </QueryClientProvider>
  );
}
