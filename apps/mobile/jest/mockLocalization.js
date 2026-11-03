/* global jest */
// jest-expo의 기본 mock은 en-US를 돌려줘서 한국어 문구를 단언하는 테스트가 전부 영어를 보게 된다.
// 기본 언어를 ko로 고정하고, 영어를 볼 테스트는 파일 안에서 다시 mock한다.
// jest.fn이 아니라 일반 함수로 둬서 restoreAllMocks가 구현을 지우지 않게 한다.
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "ko", languageTag: "ko-KR" }],
}));
