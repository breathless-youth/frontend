import { useState } from "react";

import { LegalDocumentScreen } from "@/components/LegalDocumentScreen";
import { selectLegalEdition } from "@/features/settings/legalDocuments";

/**
 * 이용약관 — 설정(S6) `약관 · 정보` 섹션에서 진입한다.
 *
 * 본문은 `features/settings/legalDocuments.ts`, 렌더링은 `LegalDocumentScreen`이 소유한다. 이
 * 파일은 "어떤 문서인가"만 정한다 — 문구를 여기 두면 개인정보처리방침과 구조가 갈라진다.
 */
export function TermsPage() {
  // 화면을 연 동안 시행 시각이 지나도 읽던 판을 바꾸지 않는다.
  const [edition] = useState(() => selectLegalEdition("terms"));
  return (
    <LegalDocumentScreen kind="terms" document={edition.document} upcoming={edition.upcoming} />
  );
}
