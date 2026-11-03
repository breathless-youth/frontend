import { readForceUpdateCopy } from "../forceUpdateCopy";
import { readRecommendedUpdateCopy } from "../recommendedUpdateCopy";
import { getRemoteConfigString } from "../remoteConfig";
import { readCopyOr } from "../remoteConfigCopy";

jest.mock("../remoteConfig", () => ({
  getRemoteConfigString: jest.fn(() => ""),
}));

let mockLanguageCode = "ko";
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: mockLanguageCode }],
}));

const mockedGetString = getRemoteConfigString as jest.Mock;

function remoteValues(values: Record<string, string>) {
  mockedGetString.mockImplementation((key: string) => values[key] ?? "");
}

beforeEach(() => {
  mockLanguageCode = "ko";
  mockedGetString.mockReset().mockImplementation(() => "");
});

describe("readCopyOr", () => {
  it("한국어 기기는 원래 키만 읽는다", () => {
    remoteValues({ force_update_title: "콘솔 제목", force_update_title_en: "Console title" });

    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("콘솔 제목");
    expect(mockedGetString).toHaveBeenCalledWith("force_update_title");
    expect(mockedGetString).not.toHaveBeenCalledWith("force_update_title_en");
  });

  it("영어 기기는 _en 키를 읽는다", () => {
    mockLanguageCode = "en";
    remoteValues({ force_update_title: "콘솔 제목", force_update_title_en: "Console title" });

    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("Console title");
  });

  it("영어 기기에서 _en 키가 없으면 한국어 키가 아니라 영어 기본 문구다", () => {
    mockLanguageCode = "en";
    remoteValues({ force_update_title: "콘솔 제목" });

    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("Update required");
    expect(mockedGetString).not.toHaveBeenCalledWith("force_update_title");
  });

  it("영어 기기에서 _en 값이 공백뿐이거나 읽기가 실패하면 영어 기본 문구다", () => {
    mockLanguageCode = "en";
    remoteValues({ force_update_title_en: "   " });
    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("Update required");

    mockedGetString.mockImplementation(() => {
      throw new Error("native down");
    });
    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("Update required");
  });
});

describe("업데이트 알림창 문구의 영어 경로", () => {
  it("강제 업데이트는 영어 기본 문구와 _en 키를 쓴다", () => {
    mockLanguageCode = "en";
    remoteValues({ force_update_button_en: "Get the update" });

    expect(readForceUpdateCopy()).toEqual({
      title: "Update required",
      message: "Please update to the latest version to keep using FocusMakers.",
      confirmLabel: "Get the update",
    });
  });

  it("권장 업데이트는 영어 기본 문구와 _en 키를 쓴다", () => {
    mockLanguageCode = "en";
    remoteValues({ recommended_update_title_en: "Version 2 is here" });

    expect(readRecommendedUpdateCopy()).toEqual({
      title: "Version 2 is here",
      message: "Update to the latest version to get an even better FocusMakers.",
      laterLabel: "Later",
      confirmLabel: "Update now",
    });
  });
});
