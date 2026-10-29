import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import type { ProfileResponse } from "@focusmakers/types";

import type * as PreparePhoto from "@/features/profile/prepareProfilePhoto";
import { prepareProfilePhoto, UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";
import { NICKNAME_RULE_MESSAGE } from "@/features/profile/profileValidation";
import { ApiError } from "@/lib/api";
import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { TokenSource } from "@/lib/auth/tokenSource";
import type * as Bridge from "@/lib/bridge";
import { postToNative } from "@/lib/bridge";
import { canUseNativeProfilePhoto, pickNativeProfilePhoto } from "@/lib/nativeProfilePhoto";
import {
  deleteProfileImage,
  getProfile,
  registerProfileImage,
  requestUploadUrl,
  updateProfile,
  uploadPhoto,
} from "@/lib/profileApi";
import { ProfilePage } from "@/routes/ProfilePage";
import { stubImageLoad } from "@/test/imageStub";

vi.mock("@/lib/profileApi", () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  requestUploadUrl: vi.fn(),
  uploadPhoto: vi.fn(),
  registerProfileImage: vi.fn(),
  deleteProfileImage: vi.fn(),
}));

vi.mock("@/features/profile/prepareProfilePhoto", async (importOriginal) => ({
  ...(await importOriginal<typeof PreparePhoto>()),
  prepareProfilePhoto: vi.fn(),
}));

const tokenSourceMock = vi.hoisted(() => ({ source: null as TokenSource | null }));

vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () => tokenSourceMock.source,
}));

vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  postToNative: vi.fn(() => false),
}));

vi.mock("@/lib/nativeProfilePhoto", () => ({
  canUseNativeProfilePhoto: vi.fn(() => false),
  pickNativeProfilePhoto: vi.fn(),
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<div data-testid="settings-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // sonner 토스트 상태는 모듈 전역이라 화면 언마운트와 무관하게 다음 테스트로 샌다.
  act(() => {
    toast.dismiss();
  });
});

describe("프로필 설정", () => {
  it("프로필을 불러와 닉네임과 아바타 이니셜을 보여준다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    expect(await screen.findByLabelText("닉네임")).toHaveValue("포메3721");
    expect(screen.getByText("포")).toBeInTheDocument();
    expect(screen.getByText("전문직")).toBeInTheDocument(); // 칩 7종 렌더 확인 대표
  });

  it("제목 프로필 수정은 상단 헤더에만 있고 본문에 중복되지 않는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    await screen.findByLabelText("닉네임");
    expect(screen.getAllByRole("heading", { name: "프로필 수정" })).toHaveLength(1);
  });

  it("카테고리 칩은 단일 선택이고 같은 칩을 다시 누르면 해제된다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, category: null });
    renderAt("/profile?userId=7");

    const chip = await screen.findByRole("radio", { name: "수능" });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-checked", "true");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-checked", "false");
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
    await userEvent.click(screen.getByRole("radio", { name: "취업" }));
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith({
        goal: "올해 안에 이직 성공",
        category: "JOB",
      });
    });
  });

  it("앞뒤 공백이 있는 닉네임을 저장하면 PATCH 본문에서 공백이 빠진다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, nickname: "숨벅찬청년들" });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "  숨벅찬청년들  " } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ nickname: "숨벅찬청년들" });
    });
  });

  it("목표 문구를 비우고 저장하면 빈 문자열을 보낸다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, goal: "올해 안에 이직 성공" });
    mockedUpdateProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ goal: "" });
    });
  });

  it("목표 문구를 공백만 남기고 저장해도 빈 문자열을 보낸다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, goal: "올해 안에 이직 성공" });
    mockedUpdateProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "   " } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ goal: "" });
    });
  });

  it("처음부터 비어 있던 목표 문구는 다른 필드만 바꿔 저장할 때 보내지 않는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, goal: null });
    mockedUpdateProfile.mockResolvedValue({ ...profile, category: "JOB" });
    renderAt("/profile?userId=7");

    await userEvent.click(await screen.findByRole("radio", { name: "취업" }));
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ category: "JOB" });
    });
  });

  it("처음부터 비어 있던 목표 문구에 공백만 넣으면 저장하기가 비활성이다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, goal: null });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    const saveButton = screen.getByRole("button", { name: "저장하기" });
    fireEvent.change(goalInput, { target: { value: "새 목표" } });
    expect(saveButton).toBeEnabled();
    fireEvent.change(goalInput, { target: { value: "   " } });

    expect(saveButton).toBeDisabled();
  });

  it("서버 목표 문구가 공백뿐이면 진입 직후 저장하기가 비활성이다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, goal: "   " });
    renderAt("/profile?userId=7");

    expect(await screen.findByLabelText("목표 문구")).toHaveValue("   ");
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();
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
    mockedUpdateProfile.mockRejectedValue(new ApiError("이미 사용 중", 409, "CONFLICT"));
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 닉네임이에요");
  });

  it("400 응답은 닉네임 인라인에 형식 규칙 문구를 보여준다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockRejectedValue(
      new ApiError("nickname: invalid", 400, "VALIDATION_FAILED"),
    );
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(NICKNAME_RULE_MESSAGE);
  });

  it.each([
    ["409 중복", new ApiError("이미 사용 중", 409, "CONFLICT"), "이미 사용 중인 닉네임이에요"],
    [
      "400 형식",
      new ApiError("nickname: invalid", 400, "VALIDATION_FAILED"),
      NICKNAME_RULE_MESSAGE,
    ],
  ])(
    "%s 저장 오류가 뜬 닉네임을 고치면 입력칸을 떠나지 않아도 오류가 사라진다",
    async (_, error, message) => {
      mockedGetProfile.mockResolvedValue({ ...profile });
      mockedUpdateProfile.mockRejectedValue(error);
      renderAt("/profile?userId=7");

      const nicknameInput = await screen.findByLabelText("닉네임");
      fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });
      await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);

      fireEvent.change(nicknameInput, { target: { value: "새닉네임" } });
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    },
  );

  it("서버가 code 없이 409만 줘도 중복 닉네임 인라인 오류로 안내한다 (BY-404 예외 폴백)", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockRejectedValue(new ApiError("Conflict", 409));
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 닉네임이에요");
  });

  it("목표 문구는 20자를 넘어도 입력을 받고, 바로 안내하며 저장을 막는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    expect(goalInput).not.toHaveAttribute("maxlength");
    expect(screen.getByText("0/20")).toBeInTheDocument();

    fireEvent.change(goalInput, { target: { value: "가".repeat(21) } });
    expect(goalInput).toHaveValue("가".repeat(21));
    expect(screen.getByText("21/20")).toHaveClass("text-state-distract-text");
    expect(await screen.findByRole("alert")).toHaveTextContent("목표는 20자까지 쓸 수 있어요");
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();

    fireEvent.change(goalInput, { target: { value: "가".repeat(20) } });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "저장하기" })).toBeEnabled();
  });

  it("공백만 넣은 목표 문구는 보낼 값 기준으로 세어 0자로 보이고 안내하지 않는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: " ".repeat(25) } });
    expect(screen.getByText("0/20")).toBeInTheDocument();
    expect(screen.queryByText("25/20")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("닉네임은 12자를 넘어도 입력을 받고, 보이는 글자로 세며 저장을 막는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    expect(nicknameInput).not.toHaveAttribute("maxlength");
    expect(screen.getByText("6/12")).toBeInTheDocument();

    fireEvent.change(nicknameInput, { target: { value: "가나다라마바사아자차카타파" } });
    expect(nicknameInput).toHaveValue("가나다라마바사아자차카타파");
    expect(screen.getByText("13/12")).toHaveClass("text-state-distract-text");
    expect(await screen.findByRole("alert")).toHaveTextContent(NICKNAME_RULE_MESSAGE);
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();

    fireEvent.change(nicknameInput, { target: { value: "🇰🇷".repeat(12) } });
    expect(screen.getByText("12/12")).toBeInTheDocument();
  });

  it("입력 중에는 형식·최소 길이 안내가 없고 입력칸을 떠나면 뜬다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "ㅍ" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(nicknameInput, { target: { value: "포" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.blur(nicknameInput);
    expect(await screen.findByRole("alert")).toHaveTextContent(NICKNAME_RULE_MESSAGE);
  });

  it("blur 오류가 뜬 닉네임을 올바르게 고치면 입력 중에 오류가 사라진다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "포" } });
    fireEvent.blur(nicknameInput);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.change(nicknameInput, { target: { value: "포메라니안" } });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("저장이 한 번 실패한 뒤에도 닉네임 형식 안내는 입력 중이 아니라 입력칸을 떠날 때 뜬다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/profile?userId=7");

    fireEvent.change(await screen.findByLabelText("목표 문구"), { target: { value: "새 목표" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();

    const nicknameInput = screen.getByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "포" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText(NICKNAME_RULE_MESSAGE)).not.toBeInTheDocument();

    fireEvent.blur(nicknameInput);
    expect(await screen.findByText(NICKNAME_RULE_MESSAGE)).toBeInTheDocument();
  });

  it("규칙에 맞지 않는 옛 닉네임을 바꾸지 않으면 blur 오류 없이 목표만 저장된다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, nickname: "옛_닉네임" });
    mockedUpdateProfile.mockResolvedValue({ ...profile, nickname: "옛_닉네임", goal: "새 목표" });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.blur(nicknameInput);
    fireEvent.change(screen.getByLabelText("목표 문구"), { target: { value: "새 목표" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ goal: "새 목표" });
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("입력칸에서 엔터를 치면 저장된다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, goal: "새 목표" });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    await userEvent.type(goalInput, "새 목표{enter}");

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ goal: "새 목표" });
    });
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

  it("보이지 않는 공백류만 입력하면 아바타는 서버 이니셜을 유지한다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    expect(screen.getByText("포")).toBeInTheDocument();

    // NBSP(U+00A0) 하나 — 서버 String.strip()은 지우지 않아 정규화 후에도 남지만
    // 눈에 보이는 글자가 아니므로, 아바타는 그 보이지 않는 문자 대신 서버 이니셜을 보여줘야 한다.
    fireEvent.change(nicknameInput, { target: { value: " " } });
    expect(screen.getByText("포")).toBeInTheDocument();
  });

  it("이모지 닉네임을 입력하면 아바타 이니셜이 깨지지 않은 온전한 글자로 바뀐다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "🧑‍💻코딩" } });

    expect(screen.getByText("🧑‍💻")).toBeInTheDocument();
    expect(screen.queryByText("포")).not.toBeInTheDocument();
  });

  it("저장에 성공하면 프로필 화면에 머문 채 저장 완료 토스트를 띄우고 저장하기를 다시 막는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, goal: "새 목표" });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "새 목표" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByText("프로필이 저장됐어요")).toBeInTheDocument();
    expect(screen.getByTestId("profile-page")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-stub")).not.toBeInTheDocument();
    expect(goalInput).toHaveValue("새 목표");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();
    });
  });

  it("이모지 닉네임 저장에 성공해도 프로필 화면에 머문 채 저장 완료 토스트를 띄운다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, nickname: "코딩🧑‍💻" });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "코딩🧑‍💻" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByText("프로필이 저장됐어요")).toBeInTheDocument();
    expect(screen.getByTestId("profile-page")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-stub")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();
    });
  });

  it("저장에 성공하면 입력칸 포커스를 풀어 키보드를 내린다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, goal: "새 목표" });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    await userEvent.type(goalInput, "새 목표{enter}");

    expect(await screen.findByText("프로필이 저장됐어요")).toBeInTheDocument();
    expect(goalInput).not.toHaveFocus();
  });

  it("저장에 성공하면 서버가 돌려준 목표 문구와 닉네임을 앱에 한 번 알린다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockResolvedValue({ ...profile, goal: "서버 목표" });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "새 목표" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByText("프로필이 저장됐어요")).toBeInTheDocument();
    expect(vi.mocked(postToNative)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postToNative)).toHaveBeenCalledWith({
      type: "profile-updated",
      goal: "서버 목표",
      nickname: "포메3721",
      atMs: expect.any(Number),
    });
  });

  it("목표 문구를 지워 저장에 성공하면 비워진 목표를 앱에 알린다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile, goal: "올해 안에 이직 성공" });
    mockedUpdateProfile.mockResolvedValue({ ...profile, goal: "" });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByText("프로필이 저장됐어요")).toBeInTheDocument();
    expect(vi.mocked(postToNative)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postToNative)).toHaveBeenCalledWith({
      type: "profile-updated",
      goal: "",
      nickname: "포메3721",
      atMs: expect.any(Number),
    });
  });

  it("저장이 실패하면 앱에 알리지 않는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    mockedUpdateProfile.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    fireEvent.change(goalInput, { target: { value: "새 목표" } });
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
    expect(vi.mocked(postToNative)).not.toHaveBeenCalled();
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

  it("캐시가 있는 상태에서 재조회가 실패해도 폼과 편집 중인 값을 유지한다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    const { queryClient } = renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "숨벅찬청년들" } });

    mockedGetProfile.mockRejectedValue(new Error("network"));
    await act(async () => {
      await queryClient.refetchQueries();
      // react-query는 상태 변경 알림을 다음 틱에 묶어 보내므로 한 틱 더 기다려야 화면에 반영된다.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByTestId("profile-error")).not.toBeInTheDocument();
    expect(screen.getByLabelText("닉네임")).toHaveValue("숨벅찬청년들");
  });
});

// 사진 메뉴 시트는 나눠 받는다. 첫 열기의 모듈 받기가 findBy 기본 시간을 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/features/profile/ProfilePhotoSheet");
});

const PHOTO = "/avatars/7/a.jpg";
const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

describe("프로필 사진", () => {
  // 사진 API는 토큰으로만 부를 수 있어 토큰을 받은 앱 문서로 연다.
  beforeEach(() => {
    // 사진 변경은 개정 방침이 시행되는 순간부터 열린다. 타이머는 실제로 둔다.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T00:00:00+09:00"));
    tokenSourceMock.source = {
      getUserId: () => 7,
      getAccessToken: async () => "token",
      getCurrentToken: () => "token",
      hasSettled: () => true,
      subscribe: () => () => {},
    } as unknown as TokenSource;
  });

  afterEach(() => {
    tokenSourceMock.source = null;
    vi.useRealTimers();
  });

  it("개정 방침 시행 전에는 토큰이 있어도 사진만 보이고 누를 곳이 없다", async () => {
    vi.setSystemTime(new Date("2026-11-03T23:59:59+09:00"));
    stubImageLoad();
    mockedGetProfile.mockResolvedValue({ ...profile, profileImageUrl: PHOTO });
    const { container } = renderAt("/profile?userId=7");

    await screen.findByLabelText("닉네임");
    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).not.toBeNull());
    expect(screen.queryByRole("button", { name: "프로필 사진 변경" })).toBeNull();
    expect(fileInput(container)).toBeNull();
  });

  it("개정 방침 시행 시각부터는 사진 변경 버튼이 보인다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    expect(await screen.findByRole("button", { name: "프로필 사진 변경" })).toBeInTheDocument();
  });

  it("토큰이 없는 문서(구 앱, 브라우저 단독)에서는 바꿀 수 없어 사진만 보이고 누를 곳이 없다", async () => {
    tokenSourceMock.source = null;
    stubImageLoad();
    mockedGetProfile.mockResolvedValue({ ...profile, profileImageUrl: PHOTO });
    const { container } = renderAt("/profile?userId=7");

    await screen.findByLabelText("닉네임");
    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).not.toBeNull());
    expect(screen.queryByRole("button", { name: "프로필 사진 변경" })).toBeNull();
    expect(fileInput(container)).toBeNull();
  });

  it("사진이 없으면 메뉴에 사진 바꾸기만 있고, 누르면 시트를 닫고 파일 선택기를 연다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderAt("/profile?userId=7");

    await userEvent.click(await screen.findByRole("button", { name: "프로필 사진 변경" }));
    await screen.findByRole("dialog", { name: "프로필 사진" });
    expect(screen.queryByRole("button", { name: "사진 삭제" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "사진 바꾸기" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toHaveAttribute("type", "file");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("앱이 사진 선택기를 지원하면 사진 바꾸기가 파일 입력 대신 앱 선택기로 고른 사진을 올린다", async () => {
    stubImageLoad();
    mockedGetProfile.mockResolvedValue({ ...profile });
    vi.mocked(canUseNativeProfilePhoto).mockReturnValue(true);
    onTestFinished(() => {
      vi.mocked(canUseNativeProfilePhoto).mockReturnValue(false);
    });
    vi.mocked(pickNativeProfilePhoto).mockResolvedValue(jpeg);
    vi.mocked(requestUploadUrl).mockResolvedValue({
      uploadUrl: "https://s3.example/put",
      key: "avatars/7/a.jpg",
      expiresAt: "2026-10-28T10:05:00Z",
    });
    vi.mocked(uploadPhoto).mockResolvedValue(undefined);
    vi.mocked(registerProfileImage).mockResolvedValue({ ...profile, profileImageUrl: PHOTO });
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const { container } = renderAt("/profile?userId=7");

    await userEvent.click(await screen.findByRole("button", { name: "프로필 사진 변경" }));
    fireEvent.click(await screen.findByRole("button", { name: "사진 바꾸기" }));

    expect(await screen.findByText("프로필 사진을 바꿨어요")).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
    expect(pickNativeProfilePhoto).toHaveBeenCalledTimes(1);
    expect(prepareProfilePhoto).not.toHaveBeenCalled();
    expect(uploadPhoto).toHaveBeenCalledWith("https://s3.example/put", jpeg);
    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).not.toBeNull());
  });

  it("고른 사진을 바로 올리는 동안 버튼을 막고, 끝나면 입력 중인 닉네임은 둔 채 사진을 보인다", async () => {
    stubImageLoad();
    mockedGetProfile.mockResolvedValue({ ...profile });
    let prepared!: (blob: Blob) => void;
    vi.mocked(prepareProfilePhoto).mockReturnValue(
      new Promise((resolve) => {
        prepared = resolve;
      }),
    );
    vi.mocked(requestUploadUrl).mockResolvedValue({
      uploadUrl: "https://s3.example/put",
      key: "avatars/7/a.jpg",
      expiresAt: "2026-10-28T10:05:00Z",
    });
    vi.mocked(uploadPhoto).mockResolvedValue(undefined);
    vi.mocked(registerProfileImage).mockResolvedValue({ ...profile, profileImageUrl: PHOTO });
    const { container } = renderAt("/profile?userId=7");

    fireEvent.change(await screen.findByLabelText("닉네임"), { target: { value: "새닉네임" } });
    await userEvent.upload(
      fileInput(container),
      new File(["raw"], "photo.jpg", { type: "image/jpeg" }),
    );

    const button = screen.getByRole("button", { name: "프로필 사진 변경" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      prepared(jpeg);
    });

    expect(await screen.findByText("프로필 사진을 바꿨어요")).toBeInTheDocument();
    expect(registerProfileImage).toHaveBeenCalledWith("avatars/7/a.jpg");
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByLabelText("닉네임")).toHaveValue("새닉네임");
    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).not.toBeNull());
  });

  it("쓸 수 없는 사진이면 안내하고, 메뉴에서 같은 사진을 다시 골라도 다시 처리한다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    vi.mocked(prepareProfilePhoto).mockRejectedValue(new UnusablePhotoError());
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const { container } = renderAt("/profile?userId=7");
    const file = new File(["raw"], "huge.jpg", { type: "image/jpeg" });

    await screen.findByLabelText("닉네임");
    await userEvent.upload(fileInput(container), file);
    expect(
      await screen.findByText("이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요"),
    ).toBeInTheDocument();
    // 선택을 비우면 Android 웹뷰가 그 파일을 못 읽게 막으므로 처리하는 동안 그대로 둔다.
    expect(fileInput(container).files?.[0]).toBe(file);
    const button = screen.getByRole("button", { name: "프로필 사진 변경" });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: "사진 바꾸기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.upload(fileInput(container), file);

    await waitFor(() => expect(prepareProfilePhoto).toHaveBeenCalledTimes(2));
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("사진이 있으면 메뉴에 사진 삭제가 있고, 누르면 확인 없이 지워 이니셜로 돌아간다", async () => {
    stubImageLoad();
    mockedGetProfile.mockResolvedValue({ ...profile, profileImageUrl: PHOTO });
    vi.mocked(deleteProfileImage).mockResolvedValue({ ...profile, profileImageUrl: null });
    const { container } = renderAt("/profile?userId=7");

    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).not.toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "프로필 사진 변경" }));
    await userEvent.click(await screen.findByRole("button", { name: "사진 삭제" }));

    expect(await screen.findByText("프로필 사진을 삭제했어요")).toBeInTheDocument();
    expect(deleteProfileImage).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    expect(screen.getByText("포")).toBeInTheDocument();
  });

  it("지우는 동안에는 사진 버튼과 닫히며 내려가는 시트의 항목을 막아 삭제와 올리기가 겹치지 않는다", async () => {
    stubImageLoad();
    mockedGetProfile.mockResolvedValue({ ...profile, profileImageUrl: PHOTO });
    let removed!: (value: ProfileResponse) => void;
    vi.mocked(deleteProfileImage).mockReturnValue(
      new Promise((resolve) => {
        removed = resolve;
      }),
    );
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderAt("/profile?userId=7");

    const button = await screen.findByRole("button", { name: "프로필 사진 변경" });
    await userEvent.click(button);
    const remove = await screen.findByRole("button", { name: "사진 삭제" });
    const change = screen.getByRole("button", { name: "사진 바꾸기" });
    // jsdom에는 애니메이션이 없어 닫힌 시트가 바로 사라진다. 끝나지 않는 전환을 돌려 내려가는 중으로 붙잡는다.
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: () => [
        { finished: new Promise(() => {}), effect: { getTiming: () => ({ duration: 300 }) } },
      ],
    });
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, "getAnimations");
    });

    fireEvent.click(remove);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(remove).toBeInTheDocument();

    fireEvent.click(remove);
    fireEvent.click(change);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteProfileImage).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();

    await act(async () => {
      removed({ ...profile, profileImageUrl: null });
    });
    expect(await screen.findByText("프로필 사진을 삭제했어요")).toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
  });
});
