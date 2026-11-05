/**
 * 테스트용 기기 선호 언어 목록 바꾸기
 *
 * expo-localization은 jest/mockLocalization.js가 모든 테스트에서 ko-KR로 mock한다.
 * 파일마다 mock을 다시 쓰지 않고 이 함수로 목록만 바꾸며, 바꾼 테스트는 끝에서 ["ko-KR"]로 되돌린다.
 */
export function setDeviceLanguages(tags: string[]): void {
  jest
    .requireMock<{ __setLocaleTags: (next: string[]) => void }>("expo-localization")
    .__setLocaleTags(tags);
}
