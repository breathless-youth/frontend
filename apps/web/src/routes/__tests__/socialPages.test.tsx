import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { ApiError } from "@/lib/api";
import { createRoom, joinRoom } from "@/lib/roomApi";

vi.mock("@/lib/roomApi", () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
}));

const mockedCreateRoom = vi.mocked(createRoom);
const mockedJoinRoom = vi.mocked(joinRoom);

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

  it("userId가 없으면 방 만들기가 비활성화된다", () => {
    renderAt("/social");

    expect(screen.getByRole("button", { name: "방 만들기" })).toBeDisabled();
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
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
  });

  it("share 미지원이면 공유하기가 복사로 폴백한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "공유하기" }));

    expect(writeText).toHaveBeenCalledWith("0712");
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
  });

  it("입장하기를 누르면 join API를 호출한다", async () => {
    mockedJoinRoom.mockResolvedValue(joinResponse);
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "입장하기" }));

    expect(mockedJoinRoom).toHaveBeenCalledWith(7, "0712");
  });

  it("닫기를 누르면 소셜 홈으로 돌아간다", async () => {
    renderAt(withState);

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(await screen.findByText("친구와 함께 공부해요")).toBeInTheDocument();
  });
});

describe("초대코드 입력", () => {
  function typeCode(value: string) {
    fireEvent.change(screen.getByLabelText("초대코드 4자리"), { target: { value } });
  }

  it("4자리가 채워져야 참여하기가 활성화된다", () => {
    renderAt("/social/join?userId=7");

    const button = screen.getByRole("button", { name: "참여하기" });
    expect(button).toBeDisabled();

    typeCode("371");
    expect(button).toBeDisabled();

    typeCode("3712");
    expect(button).toBeEnabled();
  });

  it("참여 성공 시 join API를 코드 문자열 그대로 호출한다", async () => {
    mockedJoinRoom.mockResolvedValue(joinResponse);
    renderAt("/social/join?userId=7");

    typeCode("0712");
    await userEvent.click(screen.getByRole("button", { name: "참여하기" }));

    expect(mockedJoinRoom).toHaveBeenCalledWith(7, "0712");
  });

  it("정원 초과면 인라인 문구를 보여주고 입력 화면을 유지한다", async () => {
    mockedJoinRoom.mockRejectedValue(new ApiError("가득 참", 409, "ROOM_FULL"));
    renderAt("/social/join?userId=7");

    typeCode("3712");
    await userEvent.click(screen.getByRole("button", { name: "참여하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("방이 가득 찼어요");
    expect(screen.getByLabelText("초대코드 4자리")).toHaveValue("3712");
  });

  it("없는 코드면 코드 재확인 문구를 보여준다", async () => {
    mockedJoinRoom.mockRejectedValue(new ApiError("없는 코드", 404, "INVALID_CODE"));
    renderAt("/social/join?userId=7");

    typeCode("9999");
    await userEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("코드를 다시 확인해 주세요");
    });
  });
});
