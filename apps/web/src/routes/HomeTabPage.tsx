import { useSearchParams } from "react-router-dom";

import { parseUserId } from "@/lib/userId";

/**
 * 홈(S1) 탭 골격 — 화면 내용은 BY-329에서 채운다.
 * 네이티브 셸이 `/home?userId=N`으로 로드한다(세션 `/room/:id?userId=N`과 같은 계약).
 * `/`(HomePage)는 브라우저 단독 랜딩이고, 이 라우트는 앱 탭 전용이다.
 */
export function HomeTabPage() {
  const [searchParams] = useSearchParams();
  const userId = parseUserId(searchParams.get("userId"));

  return (
    <main data-testid="home-tab-page" className="min-h-dvh bg-background text-foreground">
      {/* BY-329: 홈 화면 포팅 자리. userId는 실데이터 연동에 쓴다. */}
      {userId === null && (
        <p className="p-4 text-sm text-muted-foreground">userId 없음 — 브라우저 단독 모드</p>
      )}
    </main>
  );
}
