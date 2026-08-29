import { consumeAppLaunchSignal } from "../appLaunch";

describe("consumeAppLaunchSignal", () => {
  it("앱 프로세스에서 처음 한 번만 참을 돌려준다", () => {
    expect(consumeAppLaunchSignal()).toBe(true);
    expect(consumeAppLaunchSignal()).toBe(false);
    expect(consumeAppLaunchSignal()).toBe(false);
  });
});
