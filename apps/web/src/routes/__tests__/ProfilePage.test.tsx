import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { getProfile, updateProfile } from "@/lib/profileApi";
import { ProfilePage } from "@/routes/ProfilePage";

vi.mock("@/lib/profileApi", () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

const mockedGetProfile = vi.mocked(getProfile);
const mockedUpdateProfile = vi.mocked(updateProfile);

const profile = {
  nickname: "포메3721",
  goal: null,
  category: null,
  initial: "포",
  colorIndex: 0,
} as const;

function renderAt(path: string) {
  // App 전역 QueryClient는 기본 retry(3회 백오프)라 실패 케이스가 느려진다 —
  // HomeTabPage.test.tsx와 같은 패턴으로 retry를 끈 클라이언트로 감싼다.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<div data-testid="settings-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("프로필 설정", () => {
  it("프로필을 불러와 닉네임과 아바타 이니셜을 보여준다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    expect(await screen.findByLabelText("닉네임")).toHaveValue("포메3721");
    expect(screen.getByText("포")).toBeInTheDocument();
    expect(screen.getByText("전문직")).toBeInTheDocument(); // 칩 7종 렌더 확인 대표
  });

  it("저장 시 변경된 필드만 PATCH로 보낸다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({
      ...profile,
      goal: "올해 안에 이직 성공",
      category: "JOB",
    });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "올해 안에 이직 성공" } });
    await userEvent.click(screen.getByRole("button", { name: "취업" }));
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith(7, {
        goal: "올해 안에 이직 성공",
        category: "JOB",
      });
    });
  });

  it("변경이 없으면 저장하기가 비활성이다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    await screen.findByLabelText("닉네임");
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();
  });

  it("닉네임 형식 위반은 저장 전에 인라인으로 막는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "포" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });

  it("중복 닉네임은 서버 응답을 인라인 오류로 보여준다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockRejectedValue(new ApiError("이미 사용 중", 409, "NICKNAME_TAKEN"));
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 닉네임이에요");
  });

  it("서버가 code 없이 409만 줘도 중복 닉네임 인라인 오류로 안내한다 (BY-404 예외 폴백)", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockRejectedValue(new ApiError("Conflict", 409));
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 닉네임이에요");
  });

  it("저장 성공 시 설정 화면으로 복귀한다 (2026-08-25 BY-427 확정)", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, goal: "새 목표" });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "새 목표" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByTestId("settings-stub")).toBeInTheDocument();
  });

  it("저장이 네트워크 오류로 실패하면 재시도 문구를 보여주고 입력을 유지한다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
    expect(nicknameInput).toHaveValue("숨벅찬청년들");
  });

  it("조회 실패 시 화면을 비우지 않고 재시도 안내를 보여준다", async () => {
    mockedGetProfile.mockRejectedValue(new Error("network"));
    renderAt("/profile?userId=7");

    expect(await screen.findByTestId("profile-error")).toBeInTheDocument();
  });
});
