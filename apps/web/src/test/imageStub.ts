import { onTestFinished } from "vitest";

/**
 * 사진 로드를 끝내 주는 Image 대역
 *
 * jsdom은 이미지를 받지 않아 Base UI 아바타가 사진을 영영 그리지 않는다.
 * `src`가 들어오면 다음 마이크로태스크에 `outcome`대로 load나 error를 낸다.
 * 부른 테스트가 끝나면 원래 Image로 되돌린다.
 */
export function stubImageLoad(outcome: "load" | "error" = "load"): void {
  const RealImage = window.Image;
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 0;
    crossOrigin: string | null = null;
    set src(_value: string) {
      queueMicrotask(() => (outcome === "load" ? this.onload?.() : this.onerror?.()));
    }
  }
  window.Image = FakeImage as unknown as typeof Image;
  onTestFinished(() => {
    window.Image = RealImage;
  });
}
