import { batteryGuideKind, consentAction } from "../androidFlow";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

describe("consentAction", () => {
  it("둘 다 없으면 동의하고 사용정보 접근 설정부터 연다", () => {
    expect(consentAction(false, false)).toEqual({
      label: "동의하고 설정 열기",
      open: "usage",
    });
  });

  it("사용정보 접근만 있으면 다른 앱 위에 표시를 연다", () => {
    expect(consentAction(true, false)).toEqual({
      label: "다른 앱 위에 표시 허용하기",
      open: "overlay",
    });
  });

  it("다른 앱 위에 표시만 있으면 사용정보 접근을 연다", () => {
    expect(consentAction(false, true)).toEqual({
      label: "사용정보 접근 허용하기",
      open: "usage",
    });
  });

  it("둘 다 있으면 할 일이 없다", () => {
    expect(consentAction(true, true)).toBeNull();
  });
});

describe("batteryGuideKind", () => {
  it.each([
    ["samsung", "samsung", "samsung"],
    ["Samsung", "Samsung", "samsung"],
    ["Xiaomi", "Xiaomi", "xiaomi"],
    ["Xiaomi", "Redmi", "xiaomi"],
    ["Xiaomi", "POCO", "xiaomi"],
    ["Google", "google", null],
    ["", "", null],
  ] as const)("%s/%s는 %s 안내다", (manufacturer, brand, kind) => {
    expect(batteryGuideKind(manufacturer, brand)).toBe(kind);
  });
});
