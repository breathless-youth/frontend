import { useState } from "react";

import { LegalDocumentScreen } from "@/components/LegalDocumentScreen";
import { selectLegalEdition } from "@/features/settings/legalDocuments";

/**
 * 개인정보처리방침 — 설정(S6) `약관 · 정보` 섹션에서 진입한다.
 *
 * 본문은 `features/settings/legalDocuments.ts`, 렌더링은 `LegalDocumentScreen`이 소유한다.
 */
export function PrivacyPage() {
  // 화면을 연 동안 시행 시각이 지나도 읽던 판을 바꾸지 않는다.
  const [edition] = useState(() => selectLegalEdition("privacy"));
  return (
    <LegalDocumentScreen kind="privacy" document={edition.document} upcoming={edition.upcoming} />
  );
}
