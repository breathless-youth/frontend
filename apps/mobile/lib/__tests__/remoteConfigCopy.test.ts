import { setDeviceLanguages } from "../../jest/deviceLanguages";
import { readForceUpdateCopy } from "../forceUpdateCopy";
import { readRecommendedUpdateCopy } from "../recommendedUpdateCopy";
import { getRemoteConfigString } from "../remoteConfig";
import { readCopyOr } from "../remoteConfigCopy";

jest.mock("../remoteConfig", () => ({
  getRemoteConfigString: jest.fn(() => ""),
}));

const mockedGetString = getRemoteConfigString as jest.Mock;

function remoteValues(values: Record<string, string>) {
  mockedGetString.mockImplementation((key: string) => values[key] ?? "");
}

beforeEach(() => {
  setDeviceLanguages(["ko-KR"]);
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
    setDeviceLanguages(["en-US"]);
    remoteValues({ force_update_title: "콘솔 제목", force_update_title_en: "Console title" });

    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("Console title");
  });

  it("영어 기기에서 _en 키가 없으면 한국어 키가 아니라 영어 기본 문구다", () => {
    setDeviceLanguages(["en-US"]);
    remoteValues({ force_update_title: "콘솔 제목" });

    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("Update required");
    expect(mockedGetString).not.toHaveBeenCalledWith("force_update_title");
  });

  it.each([
    ["ja-JP", "force_update_title_ja"],
    ["zh-Hant-TW", "force_update_title_zh_hant"],
  ])("%s 기기는 %s 키를 읽는다", (tag, key) => {
    setDeviceLanguages([tag]);
    remoteValues({ force_update_title: "콘솔 제목", [key]: "Console title" });

    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("Console title");
  });

  it("일본어 기기에서 _ja 키가 없으면 한국어 키가 아니라 일본어 기본 문구다", () => {
    setDeviceLanguages(["ja-JP"]);
    remoteValues({ force_update_title: "콘솔 제목" });

    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("アップデートが必要です");
    expect(mockedGetString).not.toHaveBeenCalledWith("force_update_title");
  });

  it("한국어 기기에서 키가 비어 있으면 한국어 기본 문구다", () => {
    expect(readCopyOr("force_update_title", "forceUpdate.title")).toBe("업데이트가 필요해요");
  });

  it("영어 기기에서 _en 값이 공백뿐이거나 읽기가 실패하면 영어 기본 문구다", () => {
    setDeviceLanguages(["en-US"]);
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
    setDeviceLanguages(["en-US"]);
    remoteValues({ force_update_button_en: "Get the update" });

    expect(readForceUpdateCopy()).toEqual({
      title: "Update required",
      message: "Please update to the latest version to keep using FocusMakers.",
      confirmLabel: "Get the update",
    });
  });

  it("권장 업데이트는 영어 기본 문구와 _en 키를 쓴다", () => {
    setDeviceLanguages(["en-US"]);
    remoteValues({ recommended_update_title_en: "Version 2 is here" });

    expect(readRecommendedUpdateCopy()).toEqual({
      title: "Version 2 is here",
      message: "Update to the latest version to get an even better FocusMakers.",
      laterLabel: "Later",
      confirmLabel: "Update now",
    });
  });
});
