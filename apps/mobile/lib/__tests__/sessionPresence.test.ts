import {
  __resetSessionPresenceForTests,
  markSessionOpen,
  runAfterNextSessionScreen,
  runAfterSession,
} from "../sessionPresence";

beforeEach(() => {
  __resetSessionPresenceForTests();
});

describe("sessionPresence", () => {
  it("세션 화면이 없으면 바로 실행한다", () => {
    const run = jest.fn();

    runAfterSession(run);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("세션 화면이 떠 있으면 닫힐 때까지 미루고, 닫히면 등록 순서대로 한 번씩 실행한다", () => {
    const close = markSessionOpen();
    const first = jest.fn();
    const second = jest.fn(() => expect(first).toHaveBeenCalledTimes(1));

    runAfterSession(first);
    runAfterSession(second);
    expect(first).not.toHaveBeenCalled();

    close();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // 같은 해제를 두 번 불러도 다른 세션이 닫힌 것으로 세지 않는다.
    const closeNext = markSessionOpen();
    close();
    const third = jest.fn();
    runAfterSession(third);
    expect(third).not.toHaveBeenCalled();
    closeNext();
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("세션 화면이 겹쳐 떠 있으면 마지막 것이 닫힐 때 실행한다", () => {
    const closeFirst = markSessionOpen();
    const closeSecond = markSessionOpen();
    const run = jest.fn();
    runAfterSession(run);

    closeFirst();
    expect(run).not.toHaveBeenCalled();

    closeSecond();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("등록 뒤 처음 뜬 세션 화면이 닫힐 때만 실행하고, 그 전에는 거둘 수 있다", () => {
    const closeEarlier = markSessionOpen();
    const run = jest.fn();
    runAfterNextSessionScreen(run);

    closeEarlier();
    expect(run).not.toHaveBeenCalled();

    const closeNext = markSessionOpen();
    const closeOther = markSessionOpen();
    closeOther();
    expect(run).not.toHaveBeenCalled();
    closeNext();
    expect(run).toHaveBeenCalledTimes(1);

    const cancelled = jest.fn();
    const cancel = runAfterNextSessionScreen(cancelled);
    expect(cancel()).toBe(true);
    markSessionOpen()();
    expect(cancelled).not.toHaveBeenCalled();
    expect(cancel()).toBe(false);
  });
});
