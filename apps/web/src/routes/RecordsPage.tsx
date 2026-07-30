import { useSearchParams } from "react-router-dom";

import { parseUserId } from "@/lib/userId";

/**
 * 기록(S2) 탭 골격 — 화면 내용은 BY-330에서 채운다.
 * 네이티브 셸이 `/records?userId=N`으로 로드한다.
 */
export function RecordsPage() {
  const [searchParams] = useSearchParams();
  const userId = parseUserId(searchParams.get("userId"));

  return (
    <main data-testid="records-page" className="min-h-dvh bg-background text-foreground">
      {/* BY-330: 기록 화면 포팅 자리. userId는 실데이터 연동에 쓴다. */}
      {userId === null && (
        <p className="p-4 text-sm text-muted-foreground">userId 없음 — 브라우저 단독 모드</p>
      )}
    </main>
  );
}
