import activity from "../StudySessionActivity";

jest.mock("@expo/ui/swift-ui", () => ({}));
jest.mock("@expo/ui/swift-ui/modifiers", () => ({}));
jest.mock("expo-widgets", () => ({
  createLiveActivity: jest.fn((name: string, layout: unknown) => ({ name, layout })),
}));

// babel-preset-expo가 앱 번들과 같은 플러그인으로 레이아웃 함수를 문자열로 바꾸므로, 넘어온 문자열을 위젯 확장처럼 평가해 본다.
it("위젯 레이아웃 문자열을 위젯 확장이 그대로 평가할 수 있다", () => {
  const { layout } = activity as unknown as { layout: unknown };

  expect(typeof layout).toBe("string");
  expect(() => new Function(`return ${layout as string}`)).not.toThrow();
});
