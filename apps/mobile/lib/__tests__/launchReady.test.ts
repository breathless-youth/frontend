import {
  __resetLaunchReadyForTests,
  LAUNCH_READY_TIMEOUT_MS,
  markLaunchReady,
  markStartPromptsAllowed,
  waitForLaunchReady,
  waitForStartPrompts,
} from "../launchReady";

describe("waitForLaunchReady", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetLaunchReadyForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("신호가 오면 끝난다", async () => {
    const done = jest.fn();
    void waitForLaunchReady().then(done);

    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    markLaunchReady();
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("이미 신호가 왔으면 바로 끝난다", async () => {
    markLaunchReady();
    const done = jest.fn();
    void waitForLaunchReady().then(done);

    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("신호가 오지 않아도 상한이 지나면 끝난다", async () => {
    const done = jest.fn();
    void waitForLaunchReady().then(done);

    jest.advanceTimersByTime(LAUNCH_READY_TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("waitForStartPrompts", () => {
  beforeEach(() => {
    __resetLaunchReadyForTests();
  });

  it("시작 권한 창 차례가 오면 끝난다", async () => {
    const done = jest.fn();
    void waitForStartPrompts().then(done);

    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    markStartPromptsAllowed();
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("이미 차례가 왔으면 바로 끝난다", async () => {
    markStartPromptsAllowed();
    const done = jest.fn();
    void waitForStartPrompts().then(done);

    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
  });
});
