import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { getProfile, updateProfile } from "@/lib/profileApi";
import { ProfilePage } from "@/routes/ProfilePage";
import { SettingsPage } from "@/routes/SettingsPage";

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
  // 저장 완료 토스트 1회성 플래그가 테스트 간에 새지 않게 비운다.
  sessionStorage.clear();
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

  it("목표 문구가 20자를 넘으면 입력 중에 인라인 안내가 뜨고 저장이 막힌다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    // maxLength로 조용히 막으면 왜 안 쳐지는지 알 수 없다 — 초과 입력을 허용하고 안내한다.
    expect(goalInput).not.toHaveAttribute("maxlength");
    fireEvent.change(goalInput, {
      target: { value: "스물한글자를넘기려고일부러길게쓴목표문구입니다" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("목표는 20자까지 쓸 수 있어요");
    // 초과 상태에서는 저장 버튼 자체가 비활성이다 (2026-08-25 피드백).
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(mockedUpdateProfile).not.toHaveBeenCalled();

    // 20자 이내로 줄이면 다시 활성으로 돌아온다.
    fireEvent.change(goalInput, { target: { value: "스무자이내목표" } });
    expect(screen.getByRole("button", { name: "저장하기" })).toBeEnabled();
  });

  it("닉네임이 12자를 넘으면 입력 중에 인라인 안내가 뜨고 저장이 잠긴다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    // 목표 문구와 같은 규칙 — maxLength로 조용히 막지 않고 초과를 허용한 뒤 안내한다.
    expect(nicknameInput).not.toHaveAttribute("maxlength");
    fireEvent.change(nicknameInput, { target: { value: "열두자를넘기려고쓴열세글자" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("닉네임은 12자까지 쓸 수 있어요");
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();

    // 12자 이내로 줄이면 다시 활성으로 돌아온다.
    fireEvent.change(nicknameInput, { target: { value: "열두자이내닉네임" } });
    expect(screen.getByRole("button", { name: "저장하기" })).toBeEnabled();
  });

  it("닉네임을 바꾸면 아바타 이니셜이 입력 즉시 반영된다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    expect(screen.getByText("포")).toBeInTheDocument();

    fireEvent.change(nicknameInput, { target: { value: "밝은하마" } });
    expect(screen.getByText("밝")).toBeInTheDocument();
    expect(screen.queryByText("포")).not.toBeInTheDocument();

    // 다 지우면 서버 이니셜로 폴백한다 — 아바타가 빈 원이 되지 않게.
    fireEvent.change(nicknameInput, { target: { value: "" } });
    expect(screen.getByText("포")).toBeInTheDocument();
  });

  it("저장 성공으로 복귀한 설정 화면에 저장 완료 토스트가 뜬다 (2026-08-25 시안 A)", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, goal: "새 목표" });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/profile?userId=7"]}>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "새 목표" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
    // 토스트는 마운트 후 passive effect에서 뜨므로 동기 조회는 시점 경쟁이 된다 — 대기형으로 본다.
    expect(await screen.findByText("프로필이 저장됐어요")).toBeInTheDocument();
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
