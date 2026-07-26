import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMockSystemPauseSource,
  createSystemPauseSource,
} from "../adapters/systemPauseSource";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("createSystemPauseSource — 화면 꺼짐·백그라운드 신호원", () => {
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  it("화면이 가려지면 onLeave, 다시 보이면 onReturn을 호출한다", () => {
    const onLeave = vi.fn();
    const onReturn = vi.fn();
    const unsubscribe = createSystemPauseSource().subscribe({ onLeave, onReturn });

    setVisibility("hidden");
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onReturn).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(onReturn).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("pagehide도 onLeave로 이어진다 — WKWebView가 visibilitychange를 건너뛸 수 있다", () => {
    const onLeave = vi.fn();
    const unsubscribe = createSystemPauseSource().subscribe({ onLeave, onReturn: vi.fn() });

    window.dispatchEvent(new Event("pagehide"));

    expect(onLeave).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("구독 해제 후에는 더 이상 호출되지 않는다", () => {
    const onLeave = vi.fn();
    const unsubscribe = createSystemPauseSource().subscribe({ onLeave, onReturn: vi.fn() });

    unsubscribe();
    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));

    expect(onLeave).not.toHaveBeenCalled();
  });
});

describe("createMockSystemPauseSource", () => {
  it("수동으로 신호를 밀어넣을 수 있다", () => {
    const source = createMockSystemPauseSource();
    const onLeave = vi.fn();
    const onReturn = vi.fn();
    source.subscribe({ onLeave, onReturn });

    source.leave();
    source.return();

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
