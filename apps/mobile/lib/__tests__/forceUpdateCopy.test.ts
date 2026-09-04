import {
  FORCE_UPDATE_BUTTON_KEY,
  FORCE_UPDATE_CONFIRM_LABEL,
  FORCE_UPDATE_COPY_DEFAULTS,
  FORCE_UPDATE_DESCRIPTION,
  FORCE_UPDATE_MESSAGE_KEY,
  FORCE_UPDATE_TITLE,
  FORCE_UPDATE_TITLE_KEY,
  readForceUpdateCopy,
} from "../forceUpdateCopy";
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

describe("forceUpdateCopy (BY-586)", () => {
  it("기본 문구는 BY-533 확정 카피이고 기본값 맵은 키 세 개를 그대로 담는다", () => {
    expect(FORCE_UPDATE_TITLE).toBe("업데이트가 필요해요");
    expect(FORCE_UPDATE_DESCRIPTION).toBe("원활한 이용을 위해 최신 버전으로 업데이트 해주세요.");
    expect(FORCE_UPDATE_CONFIRM_LABEL).toBe("지금 업데이트");
    expect(FORCE_UPDATE_COPY_DEFAULTS).toEqual({
      force_update_title: FORCE_UPDATE_TITLE,
      force_update_message: FORCE_UPDATE_DESCRIPTION,
      force_update_button: FORCE_UPDATE_CONFIRM_LABEL,
    });
  });

  it("콘솔 값이 있으면 그 문구를 쓴다", () => {
    remoteValues({
      [FORCE_UPDATE_TITLE_KEY]: "새 버전으로 만나요",
      [FORCE_UPDATE_MESSAGE_KEY]: "지금 버전은 더 이상 지원하지 않아요.",
      [FORCE_UPDATE_BUTTON_KEY]: "업데이트",
    });

    expect(readForceUpdateCopy()).toEqual({
      title: "새 버전으로 만나요",
      message: "지금 버전은 더 이상 지원하지 않아요.",
      confirmLabel: "업데이트",
    });
  });

  it("값이 없거나 비어 있거나 공백뿐이면 항목별로 기본 문구로 채운다", () => {
    remoteValues({ [FORCE_UPDATE_TITLE_KEY]: "  ", [FORCE_UPDATE_BUTTON_KEY]: "확인" });

    expect(readForceUpdateCopy()).toEqual({
      title: FORCE_UPDATE_TITLE,
      message: FORCE_UPDATE_DESCRIPTION,
      confirmLabel: "확인",
    });
  });

  it("앞뒤 공백은 다듬는다", () => {
    remoteValues({ [FORCE_UPDATE_TITLE_KEY]: "  업데이트 안내  " });

    expect(readForceUpdateCopy().title).toBe("업데이트 안내");
  });

  it("읽기가 throw해도 기본 문구로 떨어진다", () => {
    mockedGetString.mockImplementation(() => {
      throw new Error("native down");
    });

    expect(readForceUpdateCopy()).toEqual({
      title: FORCE_UPDATE_TITLE,
      message: FORCE_UPDATE_DESCRIPTION,
      confirmLabel: FORCE_UPDATE_CONFIRM_LABEL,
    });
  });
});
