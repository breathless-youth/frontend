import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Graphemes from "@/lib/graphemes";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import type { RoomFormValues } from "../../types";
import { RoomFormScreen } from "../RoomFormScreen";

const graphemes = vi.hoisted(() => ({ canSegment: true }));

// 글자 단위로 셀 수 없는 구형 웹뷰를 흉내 내려고 판정 표시만 바꾸고 나머지는 실제 모듈을 쓴다.
vi.mock("@/lib/graphemes", async (importOriginal) => ({
  ...(await importOriginal<typeof Graphemes>()),
  get canSegmentGraphemes() {
    return graphemes.canSegment;
  },
}));

afterEach(() => {
  graphemes.canSegment = true;
});

const fixtures = buildGroupRoomFixtures(new Date("2026-11-02T10:00:00+09:00"));
const initial: RoomFormValues = {
  joinPolicy: "approval",
  name: "",
  visibility: "public",
  category: "수능",
  intro: "",
};

type FormProps = ComponentProps<typeof RoomFormScreen>;

function formElement(overrides: Partial<FormProps> = {}) {
  return (
    <RoomFormScreen
      mode="create"
      categories={fixtures.categories}
      initial={initial}
      pending={false}
      onBack={vi.fn()}
      onSubmit={vi.fn()}
      {...overrides}
    />
  );
}

function renderForm(overrides: Partial<FormProps> = {}) {
  return renderScreen(formElement(overrides));
}

const nameField = () => screen.getByRole("textbox", { name: "그룹 이름" });
const introField = () => screen.getByRole("textbox", { name: "그룹 소개" });

describe("RoomFormScreen", () => {
  it("offers three entry choices and submits OPEN", async () => {
    const onSubmit = vi.fn();
    renderForm({ initial: { ...initial, name: "Study" }, onSubmit });
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "신청 후 입장" })).toBeChecked();
    await userEvent.setup().click(screen.getByRole("radio", { name: "바로 입장" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "public", joinPolicy: "open" }),
    );
  });

  it.each([0, 3])("shows pending loss only when switching with %i requests", async (count) => {
    renderForm({ mode: "edit", initial: fixtures.roomForm, newRequestCount: count });
    expect(screen.queryByText(/바꾸면 남은 신청/)).toBeNull();
    await userEvent.setup().click(screen.getByRole("radio", { name: "바로 입장" }));
    if (count > 0)
      expect(screen.getByRole("status")).toHaveTextContent(
        `바꾸면 남은 신청 ${count}건이 없어져요`,
      );
    else expect(screen.queryByText(/바꾸면 남은 신청/)).toBeNull();
    await userEvent.setup().click(screen.getByRole("radio", { name: "신청 후 입장" }));
    expect(screen.queryByText(/바꾸면 남은 신청/)).toBeNull();
  });

  it("처음에는 공개와 프로필 카테고리가 골라져 있고 이름이 비면 만들 수 없다", () => {
    renderForm();
    expect(screen.getByRole("heading", { level: 1, name: "그룹 만들기" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "신청 후 입장" })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByText("공개")).toBeNull();
    expect(screen.getByRole("radio", { name: "비공개" })).not.toHaveAccessibleDescription();
    expect(screen.getByRole("button", { name: "수능" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "그룹 만들기" })).toBeDisabled();
  });

  it("그룹 이름이 20자를 넘으면 자르지 않고 만들기를 막는다", async () => {
    renderForm();
    await userEvent.setup().type(nameField(), "가".repeat(21));
    expect(nameField()).toHaveValue("가".repeat(21));
    expect(screen.getByRole("alert")).toHaveTextContent("20자까지 쓸 수 있어요");
    expect(screen.getByText("21/20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그룹 만들기" })).toBeDisabled();
  });

  it("그룹 이름이 공백뿐이면 만들 수 없다", async () => {
    renderForm();
    await userEvent.setup().type(nameField(), "   ");
    expect(screen.getByRole("button", { name: "그룹 만들기" })).toBeDisabled();
  });

  it("그룹 소개가 500자를 넘으면 만들기를 막는다", async () => {
    const user = userEvent.setup();
    renderForm({ initial: { ...initial, name: "우리 반 저녁 스터디" } });
    await user.click(introField());
    await user.paste("가".repeat(501));
    expect(introField()).toHaveValue("가".repeat(501));
    expect(screen.getByRole("alert")).toHaveTextContent("500자까지 쓸 수 있어요");
    expect(screen.getByRole("button", { name: "그룹 만들기" })).toBeDisabled();
  });

  it("소개에 연락처가 보이면 소개 칸 아래에 안내만 하고, 버튼 위에는 안내 글이 없다", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(nameField(), "수능 D-200 밤샘반");
    await user.type(introField(), "인스타 study.gram");
    expect(screen.getByText("연락처나 링크는 보낼 수 없어요")).toBeInTheDocument();
    expect(introField()).toHaveAccessibleDescription(/연락처나 링크는 보낼 수 없어요/);
    expect(nameField()).not.toHaveAttribute("aria-invalid");
    const submit = screen.getByRole("button", { name: "그룹 만들기" });
    expect(submit).toBeEnabled();
    // 버튼 위에 안내 글을 두지 않아서 아래 줄의 글은 버튼 글자뿐이다.
    expect(submit.parentElement?.textContent).toBe("그룹 만들기");
  });

  it("그룹 이름이 20자를 넘고 연락처도 있으면 글자 수 안내 한 줄만 보인다", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(nameField());
    await user.paste(`카톡 abc123 ${"가".repeat(12)}`);
    expect(screen.getByRole("alert")).toHaveTextContent("20자까지 쓸 수 있어요");
    expect(screen.queryByText("연락처나 링크는 보낼 수 없어요")).toBeNull();
  });

  it("만들면 고른 값을 넘긴다", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    await user.type(nameField(), "우리 반 저녁 스터디");
    await user.click(screen.getByRole("radio", { name: /^비공개/ }));
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "우리 반 저녁 스터디",
      visibility: "private",
      joinPolicy: "approval",
      category: "수능",
      intro: "",
    });
  });

  it("시험·목표는 하나를 골라 그 값을 넘긴다", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ initial: fixtures.roomForm, onSubmit });
    await user.click(screen.getByRole("button", { name: "공무원" }));
    expect(screen.getByRole("button", { name: "공무원" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "수능" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(onSubmit).toHaveBeenCalledWith({ ...fixtures.roomForm, category: "공무원" });
  });

  it("만드는 중에는 누를 수 없다", () => {
    renderForm({ initial: fixtures.roomForm, pending: true });
    expect(screen.getByRole("button", { name: "그룹 만들기" })).toBeDisabled();
  });

  it("그룹 설정은 공개·비공개를 보여 주기만 하고 바꿀 수 없다고 알린다", () => {
    renderForm({ mode: "edit", initial: { ...fixtures.roomForm, visibility: "private" } });
    expect(screen.getByRole("heading", { level: 1, name: "그룹 설정" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("비공개")).toBeInTheDocument();
    expect(screen.getByText("공개와 비공개는 그룹을 만든 뒤에 바꿀 수 없어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장하기" })).toBeEnabled();
  });

  it("그룹 설정은 지금 값으로 채우고 이름은 공백까지 한 글자로 세어 12/20이다", () => {
    renderForm({ mode: "edit", initial: fixtures.roomForm });
    expect(nameField()).toHaveValue("수능 D-200 밤샘반");
    expect(screen.getByText("12/20")).toBeInTheDocument();
    expect(introField()).toHaveValue(fixtures.roomForm.intro);
    expect(screen.getByText("44/500")).toBeInTheDocument();
  });

  it("서버가 막은 칸 아래에 그 문장을 보이고 그 칸을 고치면 더 보이지 않는다", async () => {
    const user = userEvent.setup();
    const filled = { ...fixtures.roomForm, intro: "같이 꾸준히 공부해요" };
    const { rerender } = renderForm({ initial: filled });
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    rerender(
      formElement({
        initial: filled,
        serverError: { field: "intro", message: "연락처나 링크는 보낼 수 없어요" },
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("연락처나 링크는 보낼 수 없어요");
    expect(introField()).toHaveAttribute("aria-invalid", "true");
    expect(nameField()).not.toHaveAttribute("aria-invalid");
    await user.type(introField(), "!");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("글자 단위로 셀 수 없는 환경에서는 글자 수로 막지 않는다", async () => {
    graphemes.canSegment = false;
    renderForm();
    await userEvent.setup().type(nameField(), "가".repeat(21));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "그룹 만들기" })).toBeEnabled();
  });

  it("뒤로 가기를 누르면 넘긴다", async () => {
    const onBack = vi.fn();
    renderForm({ onBack });
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
