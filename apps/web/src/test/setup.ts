import "@testing-library/jest-dom/vitest";

// jsdom은 media 재생을 구현하지 않아 play() 호출마다 "Not implemented" 오류를 내뿜는다.
// iOS 자동재생 방어(lib/videoPlayback.ts)가 매 렌더 play()를 부르므로 조용한 스텁을 둔다 —
// 호출 검증이 필요한 테스트는 이 스텁을 vi.spyOn으로 감싼다.
Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
  configurable: true,
  writable: true,
  value(): Promise<void> {
    return Promise.resolve();
  },
});
