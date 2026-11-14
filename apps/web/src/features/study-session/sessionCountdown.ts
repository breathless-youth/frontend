/**
 * 공부 시작 카운트다운 길이(초)
 *
 * 새 세션은 이 시간 동안 감지 모델을 미리 불러오고, 끝난 뒤에 타이머를 시작한다. 이어받은 세션은 세지 않는다.
 * 화면 테스트 대부분은 세션이 바로 뜨는 것을 전제로 해서 테스트 설정이 0으로 둔다.
 */
let countdownSeconds = 3;

export function sessionCountdownSeconds(): number {
  return countdownSeconds;
}

export function setSessionCountdownSecondsForTest(seconds: number): void {
  countdownSeconds = seconds;
}
