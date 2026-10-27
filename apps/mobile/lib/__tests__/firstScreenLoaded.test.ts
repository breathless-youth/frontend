import {
  __resetFirstScreenLoadedForTests,
  markFirstScreenLoaded,
  onFirstScreenLoaded,
} from "../firstScreenLoaded";

beforeEach(() => {
  __resetFirstScreenLoadedForTests();
});

describe("firstScreenLoaded", () => {
  it("켜지기 전에 등록한 listener는 처음 켜질 때 한 번만 불린다", () => {
    const listener = jest.fn();
    onFirstScreenLoaded(listener);
    expect(listener).not.toHaveBeenCalled();

    markFirstScreenLoaded();
    markFirstScreenLoaded();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("이미 켜졌으면 등록하자마자 불린다", () => {
    markFirstScreenLoaded();
    const listener = jest.fn();

    onFirstScreenLoaded(listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("해제한 listener는 불리지 않는다", () => {
    const listener = jest.fn();
    const unsubscribe = onFirstScreenLoaded(listener);

    unsubscribe();
    markFirstScreenLoaded();

    expect(listener).not.toHaveBeenCalled();
  });
});
