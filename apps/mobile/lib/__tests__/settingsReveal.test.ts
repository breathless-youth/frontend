import { revealSettingsTab, subscribeSettingsReveal } from "../settingsReveal";

it("구독자가 둘이어도 이어 갈 이동은 한 번만 실행한다", () => {
  const offA = subscribeSettingsReveal((then) => then());
  const offB = subscribeSettingsReveal((then) => then());
  const then = jest.fn();

  revealSettingsTab(then);

  expect(then).toHaveBeenCalledTimes(1);
  offA();
  offB();
});
