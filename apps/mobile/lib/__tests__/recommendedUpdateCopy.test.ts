import {
  readRecommendedUpdateCopy,
  RECOMMENDED_UPDATE_CONFIRM_BUTTON_KEY,
  RECOMMENDED_UPDATE_CONFIRM_LABEL,
  RECOMMENDED_UPDATE_COPY_DEFAULTS,
  RECOMMENDED_UPDATE_DESCRIPTION,
  RECOMMENDED_UPDATE_LATER_BUTTON_KEY,
  RECOMMENDED_UPDATE_LATER_LABEL,
  RECOMMENDED_UPDATE_MESSAGE_KEY,
  RECOMMENDED_UPDATE_TITLE,
  RECOMMENDED_UPDATE_TITLE_KEY,
} from "../recommendedUpdateCopy";
import { getRemoteConfigString } from "../remoteConfig";

jest.mock("../remoteConfig", () => ({
  getRemoteConfigString: jest.fn(() => ""),
}));

const mockedGetString = getRemoteConfigString as jest.Mock;

function remoteValues(values: Record<string, string>) {
  mockedGetString.mockImplementation((key: string) => values[key] ?? "");
}

beforeEach(() => {
  mockedGetString.mockReset().mockImplementation(() => "");
});

describe("recommendedUpdateCopy (BY-608)", () => {
  it("기본값 맵은 키 네 개를 초안 문구 그대로 담는다", () => {
    expect(RECOMMENDED_UPDATE_COPY_DEFAULTS).toEqual({
      recommended_update_title: RECOMMENDED_UPDATE_TITLE,
      recommended_update_message: RECOMMENDED_UPDATE_DESCRIPTION,
      recommended_update_later_button: RECOMMENDED_UPDATE_LATER_LABEL,
      recommended_update_confirm_button: RECOMMENDED_UPDATE_CONFIRM_LABEL,
    });
  });

  it("콘솔 값이 있으면 그 문구를 쓴다", () => {
    remoteValues({
      [RECOMMENDED_UPDATE_TITLE_KEY]: "업데이트 소식",
      [RECOMMENDED_UPDATE_MESSAGE_KEY]: "새 기능이 추가됐어요.",
      [RECOMMENDED_UPDATE_LATER_BUTTON_KEY]: "다음에",
      [RECOMMENDED_UPDATE_CONFIRM_BUTTON_KEY]: "업데이트",
    });

    expect(readRecommendedUpdateCopy()).toEqual({
      title: "업데이트 소식",
      message: "새 기능이 추가됐어요.",
      laterLabel: "다음에",
      confirmLabel: "업데이트",
    });
  });

  it("값이 없거나 공백뿐이면 항목별로 기본 문구로 채우고 앞뒤 공백은 다듬는다", () => {
    remoteValues({
      [RECOMMENDED_UPDATE_TITLE_KEY]: "  ",
      [RECOMMENDED_UPDATE_CONFIRM_BUTTON_KEY]: "  받기  ",
    });

    expect(readRecommendedUpdateCopy()).toEqual({
      title: RECOMMENDED_UPDATE_TITLE,
      message: RECOMMENDED_UPDATE_DESCRIPTION,
      laterLabel: RECOMMENDED_UPDATE_LATER_LABEL,
      confirmLabel: "받기",
    });
  });

  it("읽기가 throw해도 기본 문구로 떨어진다", () => {
    mockedGetString.mockImplementation(() => {
      throw new Error("native down");
    });

    expect(readRecommendedUpdateCopy()).toEqual({
      title: RECOMMENDED_UPDATE_TITLE,
      message: RECOMMENDED_UPDATE_DESCRIPTION,
      laterLabel: RECOMMENDED_UPDATE_LATER_LABEL,
      confirmLabel: RECOMMENDED_UPDATE_CONFIRM_LABEL,
    });
  });
});
