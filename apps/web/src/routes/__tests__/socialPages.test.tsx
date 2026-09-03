import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type * as AppHandoffModule from "@/features/social-room/appHandoff";
import { openInApp } from "@/features/social-room/appHandoff";
import { ApiError } from "@/lib/api";
import { createRoom, enterLiveRoom, renewLiveRoomSeat } from "@/lib/roomApi";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";

vi.mock("@/lib/roomApi", () => ({
  createRoom: vi.fn(),
  enterLiveRoom: vi.fn(),
  renewLiveRoomSeat: vi.fn(),
}));

vi.mock("@/features/social-room/appHandoff", async (importOriginal) => ({
  ...(await importOriginal<typeof AppHandoffModule>()),
  openInApp: vi.fn(),
}));

const mockedCreateRoom = vi.mocked(createRoom);
const mockedEnterRoom = vi.mocked(enterLiveRoom);
const mockedRenewSeat = vi.mocked(renewLiveRoomSeat);

const joinResponse = {
  roomId: 42,
  graceRejoin: false,
  cameraOn: null,
  iceServers: [],
  iceTtlSeconds: 7200,
};

function renderAt(path: string | { pathname: string; search: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("소셜 홈", () => {
  it("확정 카피 3종과 버튼 2개를 보여준다", () => {
    renderAt("/social?userId=7");

    expect(screen.getByText("친구와 함께 공부해요")).toBeInTheDocument();
    expect(screen.getByText(/방을 만들어 초대코드를 공유하거나/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "방 만들기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초대코드로 참여" })).toBeInTheDocument();
  });

  it("방 만들기 성공 시 코드 공유 화면으로 넘어가 코드를 보여준다", async () => {
    mockedCreateRoom.mockResolvedValue({ roomId: 42, inviteCode: "0712", emptyTtlSeconds: 600 });
    renderAt("/social?userId=7");

    await userEvent.click(screen.getByRole("button", { name: "방 만들기" }));

    expect(mockedCreateRoom).toHaveBeenCalledWith(7);
    expect(await screen.findByText("방이 만들어졌어요")).toBeInTheDocument();
    expect(screen.getByText("0712")).toBeInTheDocument();
  });

  it("방 만들기 실패 시 토스트를 띄우고 버튼이 다시 활성화된다", async () => {
    mockedCreateRoom.mockRejectedValue(new ApiError("서버 오류", 500));
    renderAt("/social?userId=7");

    const button = screen.getByRole("button", { name: "방 만들기" });
    await userEvent.click(button);

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("초대코드로 참여를 누르면 입력 화면으로 이동한다", async () => {
    renderAt("/social?userId=7");

    await userEvent.click(screen.getByRole("button", { name: "초대코드로 참여" }));

    expect(await screen.findByText("초대코드를 입력해 주세요")).toBeInTheDocument();
  });

  it("초대코드로 참여로 진입하면 URL에 남은 이전 코드가 프리필되지 않는다 (BY-581)", async () => {
    renderAt("/social?userId=7&code=0712");

    await userEvent.click(screen.getByRole("button", { name: "초대코드로 참여" }));

    expect(await screen.findByText("초대코드를 입력해 주세요")).toBeInTheDocument();
    // 이전 코드가 눌어붙지 않아 입력란이 비어 있다.
    expect(screen.getByLabelText("초대코드 4자리")).toHaveValue("");
    // userId는 유지된다 — 코드를 채우면 참여 버튼이 활성화된다(userId가 null이면 계속 비활성).
    await userEvent.type(screen.getByLabelText("초대코드 4자리"), "1234");
    expect(screen.getByRole("button", { name: "참여하기" })).toBeEnabled();
  });

  it("외부 초대 링크로 직접 진입하면 코드가 프리필된다 (회귀)", () => {
    renderAt("/social/join?userId=7&code=0712");

    expect(screen.getByLabelText("초대코드 4자리")).toHaveValue("0712");
  });

  it("userId가 없으면 방 만들기가 비활성화된다", () => {
    renderAt("/social");

    expect(screen.getByRole("button", { name: "방 만들기" })).toBeDisabled();
  });

  it("룸에서 밀려나며 남긴 안내가 있으면 마운트 시 토스트로 보여주고 한 번만 뜬다", () => {
    markSocialRoomNotice("방이 만료되었어요");
    const { unmount } = renderAt("/social?userId=7");

    expect(screen.getByText("방이 만료되었어요")).toBeInTheDocument();

    // 안내는 1회성이다 — 웹뷰가 또 리로드돼 소셜 홈이 다시 마운트돼도 반복되지 않는다.
    unmount();
    renderAt("/social?userId=7");
    expect(screen.queryByText("방이 만료되었어요")).not.toBeInTheDocument();
  });

  it("안내는 웹뷰(문서)가 달라도 전달된다 — sessionStorage가 아니라 localStorage에 남는다", () => {
    markSocialRoomNotice("방이 만료되었어요");
    // 다른 웹뷰는 sessionStorage를 공유하지 않는다 — 지워도 안내가 살아 있어야 한다.
    sessionStorage.clear();
    renderAt("/social?userId=7");

    expect(screen.getByText("방이 만료되었어요")).toBeInTheDocument();
  });

  it("네이티브 셸에서 noticeHandoff 이동은 안내를 소비하지 않는다 — 도착지 탭 웹뷰가 띄운다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    markSocialRoomNotice("자리를 오래 비워서 여기까지의 공부 기록을 저장했어요");
    const { unmount } = renderAt({
      pathname: "/social",
      search: "?userId=7",
      state: { noticeHandoff: true },
    });

    // 세션 웹뷰의 임시 소셜 홈 — 곧 네이티브가 진짜 탭으로 전환하므로 여기서 띄우면 깜빡인다.
    expect(screen.queryByText(/공부 기록을 저장했어요/)).not.toBeInTheDocument();

    unmount();
    vi.unstubAllGlobals();
    renderAt("/social?userId=7");
    expect(screen.getByText(/공부 기록을 저장했어요/)).toBeInTheDocument();
  });

  it("남긴 안내가 없으면 토스트가 뜨지 않는다", () => {
    renderAt("/social?userId=7");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("초대코드 공유", () => {
  const withState = {
    pathname: "/social/code",
    search: "?userId=7",
    state: { roomId: 42, inviteCode: "0712" },
  };

  it("router state가 없으면 소셜 홈으로 돌려보낸다", () => {
    renderAt("/social/code?userId=7");

    expect(screen.getByText("친구와 함께 공부해요")).toBeInTheDocument();
  });

  it("코드와 안내 문구를 보여준다", () => {
    renderAt(withState);

    expect(screen.getByText("방이 만들어졌어요")).toBeInTheDocument();
    expect(screen.getByText("0712")).toBeInTheDocument();
    expect(screen.getByText("모두가 나가면 방과 코드가 사라져요")).toBeInTheDocument();
  });

  it("코드 복사를 누르면 클립보드에 쓰고 토스트를 띄운다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "코드 복사" }));

    expect(writeText).toHaveBeenCalledWith("0712");
    expect(await screen.findByText("초대코드를 복사했어요")).toBeInTheDocument();
  });

  it("share 미지원이면 공유하기가 공유 텍스트(링크 포함) 복사로 폴백한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "공유하기" }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/social/join?code=0712") as unknown as string,
    );
    expect(await screen.findByText("초대코드를 복사했어요")).toBeInTheDocument();
  });

  it("입장하기를 누르면 join API를 호출하고 룸 화면까지 간다", async () => {
    mockedEnterRoom.mockResolvedValue(joinResponse);
    mockedRenewSeat.mockResolvedValue(joinResponse);
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "입장하기" }));

    expect(mockedEnterRoom).toHaveBeenCalledWith(7, "0712");
    // 목적지 렌더까지 봐야 한다 — API 호출만 단언하면 룸 화면이 크래시해도 초록으로 남는다.
    expect(await screen.findByTestId("live-room-page")).toBeInTheDocument();
  });

  it("입장 실패 시 토스트로 알리고 화면을 유지한다", async () => {
    mockedEnterRoom.mockRejectedValue(new ApiError("정원 초과", 409, "CONFLICT"));
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "입장하기" }));

    expect(await screen.findByText("방이 가득 찼어요")).toBeInTheDocument();
    expect(screen.getByText("0712")).toBeInTheDocument();
  });

  it("닫기를 누르면 소셜 홈으로 돌아간다", async () => {
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(await screen.findByText("친구와 함께 공부해요")).toBeInTheDocument();
  });

  it("방 만들기로 진입했다가 닫아도 소셜 홈으로 돌아간다", async () => {
    mockedCreateRoom.mockResolvedValue({ roomId: 42, inviteCode: "0712", emptyTtlSeconds: 600 });
    renderAt("/social?userId=7");

    await userEvent.click(screen.getByRole("button", { name: "방 만들기" }));
    await screen.findByText("방이 만들어졌어요");
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(await screen.findByText("친구와 함께 공부해요")).toBeInTheDocument();
  });
});

describe("앱에서 참여하기 유도", () => {
  const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36";

  afterEach(() => {
    delete (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    vi.mocked(openInApp).mockClear();
    vi.restoreAllMocks();
  });

  it("모바일 브라우저(브리지 없음)에서 버튼을 누르면 코드를 실어 앱 열기를 시도한다", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_UA);
    renderAt("/social/join?userId=7&code=0412");

    await userEvent.click(screen.getByRole("button", { name: "앱에서 참여하기" }));
    expect(openInApp).toHaveBeenCalledWith("android", "0412");
  });

  it("코드가 미완성이면 코드 없이 앱 열기를 시도한다", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_UA);
    renderAt("/social/join?userId=7&code=07");

    await userEvent.click(screen.getByRole("button", { name: "앱에서 참여하기" }));
    expect(openInApp).toHaveBeenCalledWith("android", "");
  });

  it("웹뷰(브리지 있음)에서는 보여주지 않는다", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_UA);
    (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage: vi.fn(),
    };
    renderAt("/social/join?userId=7&code=0412");

    expect(screen.queryByRole("button", { name: "앱에서 참여하기" })).not.toBeInTheDocument();
  });

  it("데스크톱 브라우저에서는 보여주지 않는다", () => {
    renderAt("/social/join?userId=7&code=0412");

    expect(screen.queryByRole("button", { name: "앱에서 참여하기" })).not.toBeInTheDocument();
  });
});

describe("초대코드 입력", () => {
  function typeCode(value: string) {
    fireEvent.change(screen.getByLabelText("초대코드 4자리"), { target: { value } });
  }

  it("초대 링크의 ?code로 들어오면 코드가 채워진 채 시작한다", () => {
    renderAt("/social/join?userId=7&code=0712");

    expect(screen.getByLabelText("초대코드 4자리")).toHaveValue("0712");
    expect(screen.getByRole("button", { name: "참여하기" })).toBeEnabled();
  });

  it("?code에 숫자가 아닌 값이 섞이면 걸러서 시작한다", () => {
    renderAt("/social/join?userId=7&code=07ab");

    expect(screen.getByLabelText("초대코드 4자리")).toHaveValue("07");
    expect(screen.getByRole("button", { name: "참여하기" })).toBeDisabled();
  });

  it("4자리가 채워져야 참여하기가 활성화된다", () => {
    renderAt("/social/join?userId=7");

    const button = screen.getByRole("button", { name: "참여하기" });
    expect(button).toBeDisabled();

    typeCode("371");
    expect(button).toBeDisabled();

    typeCode("3712");
    expect(button).toBeEnabled();
  });

  it("참여 성공 시 join API를 코드 문자열 그대로 호출하고 룸 화면까지 간다", async () => {
    mockedEnterRoom.mockResolvedValue(joinResponse);
    mockedRenewSeat.mockResolvedValue(joinResponse);
    renderAt("/social/join?userId=7");

    typeCode("0712");
    await userEvent.click(screen.getByRole("button", { name: "참여하기" }));

    expect(mockedEnterRoom).toHaveBeenCalledWith(7, "0712");
    expect(await screen.findByTestId("live-room-page")).toBeInTheDocument();
  });

  it("정원 초과면 인라인 문구를 보여주고 입력 화면을 유지한다", async () => {
    mockedEnterRoom.mockRejectedValue(new ApiError("정원 초과", 409, "CONFLICT"));
    renderAt("/social/join?userId=7");

    typeCode("3712");
    await userEvent.click(screen.getByRole("button", { name: "참여하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("방이 가득 찼어요");
    expect(screen.getByLabelText("초대코드 4자리")).toHaveValue("3712");
  });

  it("네트워크 실패면 재시도 문구를 보여주고 코드를 유지한다", async () => {
    mockedEnterRoom.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/social/join?userId=7");

    typeCode("3712");
    await userEvent.click(screen.getByRole("button", { name: "참여하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
    expect(screen.getByLabelText("초대코드 4자리")).toHaveValue("3712");
  });

  it("없는 코드면 코드 재확인 문구를 보여준다", async () => {
    mockedEnterRoom.mockRejectedValue(new ApiError("없는 코드", 404, "INVITE_CODE_NOT_FOUND"));
    renderAt("/social/join?userId=7");

    typeCode("9999");
    await userEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("초대코드를 다시 확인해 주세요");
    });
  });
});
