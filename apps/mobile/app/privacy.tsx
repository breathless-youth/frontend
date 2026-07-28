import { LegalDocumentScreen } from "../components/LegalDocumentScreen";
import { PRIVACY_POLICY } from "../lib/legalDocuments";

/**
 * 개인정보처리방침 — 설정(S6) `약관 · 정보` 섹션에서 진입한다.
 *
 * 본문은 `lib/legalDocuments.ts`, 렌더링은 `LegalDocumentScreen`이 소유한다.
 */
export default function PrivacyScreen() {
  return <LegalDocumentScreen document={PRIVACY_POLICY} />;
}
