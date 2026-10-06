import "@testing-library/jest-dom/vitest";

// jsdom은 HTMLMediaElement.play를 구현하지 않아 호출마다 jsdomError를 낸다.
// 세션 영상이 마운트 직후 재생을 직접 걸고(lib/startVideoPlayback.ts), 자동재생 방어
// (lib/videoPlayback.ts)도 매 렌더 play()를 부르므로 전역에서 무해한 구현으로 바꾼다 —
// 호출 검증이 필요한 테스트는 이 스텁을 vi.spyOn으로 감싼다.
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  writable: true,
  value: () => Promise.resolve(),
});

// jsdom에는 ResizeObserver가 없다. 차트(recharts ResponsiveContainer)가 마운트하며 만들므로
// 아무것도 재지 않는 구현을 둔다 — 차트 크기가 필요한 테스트는 ResponsiveContainer를 따로 mock한다.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
