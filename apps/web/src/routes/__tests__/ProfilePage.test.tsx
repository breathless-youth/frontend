import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NICKNAME_RULE_MESSAGE } from "@/features/profile/profileValidation";
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

  it("목표 문구 입력칸은 20자에서 더 이상 입력되지 않는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const goalInput = await screen.findByLabelText("목표 문구");
    expect(goalInput).toHaveAttribute("maxlength", "20");
    await userEvent.type(goalInput, "가".repeat(21));
    expect(goalInput).toHaveValue("가".repeat(20));
  });

  it("닉네임은 보이는 글자 12자에서 잘리고 이모지 12자는 그대로 둔다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    // maxLength는 이모지를 여러 칸으로 세서 서버가 받는 닉네임을 먼저 막는다.
    expect(nicknameInput).not.toHaveAttribute("maxlength");
    fireEvent.change(nicknameInput, { target: { value: "열두자를넘기려고쓴열세글자" } });
    expect(nicknameInput).toHaveValue("열두자를넘기려고쓴열세글");

    fireEvent.change(nicknameInput, { target: { value: "🇰🇷".repeat(12) } });
    expect(nicknameInput).toHaveValue("🇰🇷".repeat(12));
  });

  it("한글 조합으로 넘친 글자는 조합이 끝나도 고쳐 쓰지 않고 입력칸을 떠날 때 안내한다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.compositionStart(nicknameInput);
    fireEvent.change(nicknameInput, { target: { value: "가나다라마바사아자차카타파" } });
    expect(nicknameInput).toHaveValue("가나다라마바사아자차카타파");

    // 조합이 끝나는 순간 값을 고쳐 쓰면 키보드가 들고 있는 글자와 입력칸 값이 어긋난다.
    fireEvent.compositionEnd(nicknameInput);
    expect(nicknameInput).toHaveValue("가나다라마바사아자차카타파");

    fireEvent.blur(nicknameInput);
    expect(await screen.findByRole("alert")).toHaveTextContent(NICKNAME_RULE_MESSAGE);
  });

  it("닉네임이 보이는 글자 12자에 닿으면 입력칸이 더 받지 않는다", async () => {
    mockedGetProfile.mockResolvedValue({ ...profile });
    renderAt("/profile?userId=7");

    const nicknameInput = await screen.findByLabelText("닉네임");
    fireEvent.change(nicknameInput, { target: { value: "가".repeat(11) } });
    expect(nicknameInput).not.toHaveAttribute("maxlength");
    fireEvent.change(nicknameInput, { target: { value: "가".repeat(12) } });
    expect(nicknameInput).toHaveAttribute("maxlength", "12");

    await userEvent.clear(nicknameInput);
    await userEvent.type(nicknameInput, "가".repeat(14));
    expect(nicknameInput).toHaveValue("가".repeat(12));
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
