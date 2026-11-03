import { CONTACT_BLOCKED_COPY, containsContactOrLink } from "./model/contactCheck";
import { countGroupText } from "./model/limits";

/**
 * 그룹 글 입력칸 아래의 오류 문장
 *
 * 한 입력칸 아래에는 오류를 한 줄만 두므로 보내기를 막는 글자 수 초과를 먼저 알리고, 그다음에 연락처·링크를 알린다.
 * 글자 수는 서버와 같은 방식으로 세야 한도 끝에서 화면과 서버의 판정이 어긋나지 않는다.
 */
export function groupFieldError(text: string, max: number, checkContact: boolean): string | null {
  if (countGroupText(text) > max) {
    return `${max}자까지 쓸 수 있어요`;
  }
  return checkContact && containsContactOrLink(text) ? CONTACT_BLOCKED_COPY : null;
}
