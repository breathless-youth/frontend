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
    const close = markSessionOpen("single");
    const first = jest.fn();
    const second = jest.fn(() => expect(first).toHaveBeenCalledTimes(1));

    runAfterSession(first);
    runAfterSession(second);
    expect(first).not.toHaveBeenCalled();

    close();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // 같은 해제를 두 번 불러도 다른 세션이 닫힌 것으로 세지 않는다.
    const closeNext = markSessionOpen("single");
    close();
    const third = jest.fn();
    runAfterSession(third);
    expect(third).not.toHaveBeenCalled();
    closeNext();
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("세션 화면이 겹쳐 떠 있으면 마지막 것이 닫힐 때 실행한다", () => {
    const closeFirst = markSessionOpen("single");
    const closeSecond = markSessionOpen("single");
    const run = jest.fn();
    runAfterSession(run);

    closeFirst();
    expect(run).not.toHaveBeenCalled();

    closeSecond();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("등록 뒤 처음 뜬 세션 화면이 닫힐 때만 실행하고, 그 전에는 거둘 수 있다", () => {
    const closeEarlier = markSessionOpen("single");
    const run = jest.fn();
    runAfterNextSessionScreen(run);

    closeEarlier();
    expect(run).not.toHaveBeenCalled();

    const closeNext = markSessionOpen("single");
    const closeOther = markSessionOpen("single");
    closeOther();
    expect(run).not.toHaveBeenCalled();
    closeNext();
    expect(run).toHaveBeenCalledTimes(1);

    const cancelled = jest.fn();
    const cancel = runAfterNextSessionScreen(cancelled);
    expect(cancel()).toBe(true);
    markSessionOpen("single")();
    expect(cancelled).not.toHaveBeenCalled();
    expect(cancel()).toBe(false);
  });

  it("다음 세션 화면을 기다리는 일은 소셜룸 세션이 아니라 싱글룸 화면이 가져간다", () => {
    const run = jest.fn();
    runAfterNextSessionScreen(run);

    const closeSocial = markSessionOpen("social");
    closeSocial();
    expect(run).not.toHaveBeenCalled();

    const closeSingle = markSessionOpen("single");
    closeSingle();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
