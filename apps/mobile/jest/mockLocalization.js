/* global jest */
// jest-expo의 기본 mock은 en-US를 돌려줘서 한국어 문구를 단언하는 테스트가 전부 영어를 보게 된다.
// 기본 언어를 ko로 고정하고, 다른 언어를 볼 테스트는 jest/deviceLanguages.ts의 setDeviceLanguages로 선호 언어 목록을 바꾼다.
// jest.fn이 아니라 일반 함수로 둬서 restoreAllMocks가 구현을 지우지 않게 한다.
jest.mock("expo-localization", () => {
  let tags = ["ko-KR"];
  return {
    getLocales: () =>
      tags.map((languageTag) => ({ languageTag, languageCode: languageTag.split(/[-_]/)[0] })),
    __setLocaleTags: (next) => {
      tags = next;
    },
  };
});
