import { canSegmentGraphemes } from "@/lib/graphemes";
import i18n from "@/lib/i18n";

import { contactBlockedCopy, containsContactOrLink } from "./model/contactCheck";
import { countGroupText } from "./model/limits";

/**
 * 그룹 글이 글자 수 한도를 넘었는지
 *
 * 글자 수는 서버와 같은 방식으로 세야 한도 끝에서 화면과 서버의 판정이 어긋나지 않는다.
 * 글자 단위로 셀 수 없는 구형 웹뷰는 이모지 조합을 여러 글자로 세어 맞는 글을 막으므로 그 환경에서는 서버의 판정에 맡긴다.
 */
export function isOverGroupLimit(text: string, max: number): boolean {
  return canSegmentGraphemes && countGroupText(text) > max;
}

/**
 * 그룹 글 입력칸 아래의 오류 문장
 *
 * 한 입력칸 아래에는 오류를 한 줄만 두므로 보내기를 막는 글자 수 초과를 먼저 알린다.
 * 그다음은 서버가 막은 문장이고, 판정의 원본이 서버라 입력 중의 연락처·링크 안내보다 앞에 둔다.
 */
export function groupFieldError(
  text: string,
  max: number,
  checkContact: boolean,
  serverError: string | null = null,
): string | null {
  if (isOverGroupLimit(text, max)) {
    return i18n.t("group-room:fieldError.tooLong", { count: max });
  }
  if (serverError) {
    return serverError;
  }
  return checkContact && containsContactOrLink(text) ? contactBlockedCopy() : null;
}
