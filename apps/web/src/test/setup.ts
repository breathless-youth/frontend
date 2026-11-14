import "@testing-library/jest-dom/vitest";

import { beforeEach } from "vitest";

import { resetShowOriginalForTest } from "@/features/group-room/model/groupTranslation";
import { setSessionCountdownSecondsForTest } from "@/features/study-session/sessionCountdown";

import i18n from "@/lib/i18n";
import { LOCALE_STORAGE_KEY } from "@/lib/locale";

// jsdom의 navigator.language는 en-US라 그대로 두면 영어로 뜬다.
// 기존 테스트의 한국어 단언이 그대로 통과하도록 모든 테스트를 한국어로 시작한다.
await i18n.changeLanguage("ko");
// i18n 모듈이 로드될 때 정한 언어를 sessionStorage에 적는데, 저장소가 비어 있다고 보는 테스트가 있어 지운다.
sessionStorage.removeItem(LOCALE_STORAGE_KEY);

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

// 그룹 글 원문 보기 설정은 모듈 메모리에 남아서 앞 테스트에서 누른 값이 다음 테스트로 넘어가지 않게 매번 번역 보기로 되돌린다.
beforeEach(() => {
  resetShowOriginalForTest();
});

// 화면 테스트 대부분은 세션이 바로 뜨는 것을 전제로 한다. 카운트다운은 전용 테스트가 켠다.
beforeEach(() => {
  setSessionCountdownSecondsForTest(0);
});
