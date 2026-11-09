/**
 * 공개 그룹 초대 코드
 *
 * 앱 셸이 초대 링크에서 `code` 값만 웹으로 넘겨서, 공개 그룹도 같은 칸에 싣는다.
 * 하이픈은 6자리 영문·숫자 초대코드와 모양이 겹치지 않게 한다.
 */
export function publicInviteCode(groupId: number): string {
  return `g-${groupId}`;
}

/**
 * 공개 그룹 초대 링크
 *
 * 받는 사람이 보낸 사람과 같은 환경에 도착하도록 지금 떠 있는 웹 주소를 쓴다.
 */
export function publicInviteLink(groupId: number): string {
  return `${window.location.origin}/social/join?code=${publicInviteCode(groupId)}`;
}
