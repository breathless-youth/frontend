/**
 * 공개 그룹 초대 코드
 *
 * 앱 셸이 초대 링크에서 `code` 값만 웹으로 넘겨서, 공개 그룹도 같은 칸에 싣는다.
 * 앱 셸은 하이픈을 지우고 대문자로 바꾼 6자리가 초대코드 글자면 그룹 초대코드로 넘기는데, 서버 초대코드에는 O가 없어서 `GO`로 시작하면 초대코드가 되지 않는다.
 */
export function publicInviteCode(groupId: number): string {
  return `go-${groupId}`;
}

/**
 * 공개 그룹 초대 링크
 *
 * 받는 사람이 보낸 사람과 같은 환경에 도착하도록 지금 떠 있는 웹 주소를 쓴다.
 */
export function publicInviteLink(groupId: number): string {
  return `${window.location.origin}/social/join?code=${publicInviteCode(groupId)}`;
}
