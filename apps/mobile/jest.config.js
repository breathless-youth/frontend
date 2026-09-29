module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    // 폰트 원본은 node_modules의 pretendard에서 require한다. jest-expo의 에셋 변환은
    // node_modules를 건너뛰어 바이너리를 JS로 읽다 죽으므로 이 파일들만 스텁으로 돌린다.
    "^pretendard/.+\\.otf$": "<rootDir>/jest/fontAssetStub.js",
  },
};
