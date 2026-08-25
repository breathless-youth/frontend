import "@testing-library/jest-dom/vitest";

// jsdom은 HTMLMediaElement.play를 구현하지 않아 호출마다 jsdomError를 낸다.
// 세션 영상이 마운트 직후 재생을 직접 걸기 때문에 전역에서 무해한 구현으로 바꾼다.
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  writable: true,
  value: () => Promise.resolve(),
});
