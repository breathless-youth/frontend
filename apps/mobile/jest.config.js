module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest/mockWorklets.js"],
  // RN의 FlatList·Image·TextInput은 처음 쓸 때 불러와서, 화면 테스트의 첫 렌더가 그 변환 시간까지 떠안는다.
  // 캐시가 빈 CI에서는 그 첫 케이스가 기본 5초를 넘겨, 동작과 상관없이 실패한다.
  testTimeout: 15_000,
  moduleNameMapper: {
    // 폰트 원본은 node_modules의 pretendard에서 require한다. jest-expo의 에셋 변환은
    // node_modules를 건너뛰어 바이너리를 JS로 읽다 죽으므로 이 파일들만 스텁으로 돌린다.
    "^pretendard/.+\\.otf$": "<rootDir>/jest/fontAssetStub.js",
  },
};
