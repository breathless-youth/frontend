import i18n from "@/lib/i18n";

/**
 * 그룹 화면에 쓰는 멤버 이름
 *
 * 책상, 이번 주 순위, 멤버 목록에서 자기 자리를 바로 찾도록 지금 보는 사람은 닉네임 대신 `나`로 쓴다.
 */
export function memberName(person: { nickname: string; isMe: boolean }): string {
  return person.isMe ? i18n.t("group-room:memberName.me") : person.nickname;
}
