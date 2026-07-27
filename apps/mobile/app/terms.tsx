import { LegalDocumentScreen } from "../components/LegalDocumentScreen";
import { TERMS_OF_SERVICE } from "../lib/legalDocuments";

/**
 * 이용약관 — 설정(S6) `약관 · 정보` 섹션에서 진입한다.
 *
 * 본문은 `lib/legalDocuments.ts`, 렌더링은 `LegalDocumentScreen`이 소유한다. 이 파일은
 * "어떤 문서인가"만 정한다 — 문구를 여기 두면 개인정보처리방침과 구조가 갈라진다.
 */
export default function TermsScreen() {
  return <LegalDocumentScreen document={TERMS_OF_SERVICE} />;
}
