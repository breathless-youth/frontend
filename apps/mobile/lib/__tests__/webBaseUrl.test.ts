import { getWebBaseUrl } from "../webBaseUrl";

let mockWebBaseUrl: string | undefined = "https://web.test";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { webBaseUrl: mockWebBaseUrl } };
    },
  },
}));

describe("getWebBaseUrl", () => {
  afterEach(() => {
    mockWebBaseUrl = "https://web.test";
  });

  it("설정된 값을 그대로 돌려준다", () => {
    expect(getWebBaseUrl()).toBe("https://web.test");
  });

  it("빈 문자열이면(BY-332a 미완) 명확하게 실패한다", () => {
    mockWebBaseUrl = "";
    expect(() => getWebBaseUrl()).toThrow();
  });

  it("값이 아예 없으면 명확하게 실패한다", () => {
    mockWebBaseUrl = undefined;
    expect(() => getWebBaseUrl()).toThrow();
  });
});
