import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Graphemes from "@/lib/graphemes";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { enterGlassChrome, resetGlassChrome } from "@/test/nativeControlStub";

import { renderScreen } from "../../__tests__/renderScreen";
import { ApplyScreen } from "../ApplyScreen";
import { ReportApplicationScreen } from "../ReportApplicationScreen";
import { ReportMemberScreen } from "../ReportMemberScreen";

vi.mock("@/lib/useKeyboardInset", () => ({ useKeyboardInset: vi.fn(() => 0) }));

const graphemes = vi.hoisted(() => ({ canSegment: true }));

// 글자 단위로 셀 수 없는 구형 웹뷰를 흉내 내려고 판정 표시만 바꾸고 나머지는 실제 모듈을 쓴다.
vi.mock("@/lib/graphemes", async (importOriginal) => ({
  ...(await importOriginal<typeof Graphemes>()),
  get canSegmentGraphemes() {
    return graphemes.canSegment;
  },
}));

function ApplyHarness({
  pending = false,
  serverError,
  onSubmit = vi.fn(),
  onBack = vi.fn(),
}: {
  pending?: boolean;
  serverError?: string | null;
  onSubmit?: () => void;
  onBack?: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <ApplyScreen
      roomName="새벽 5시 기상 공시반"
      ownerNickname="옥수수라떼"
      value={value}
      onChange={setValue}
      pending={pending}
      serverError={serverError}
      onSubmit={onSubmit}
      onBack={onBack}
    />
  );
}

function ReportApplicationHarness({
  serverError,
  onSubmit = vi.fn(),
}: {
  serverError?: string | null;
  onSubmit?: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <ReportApplicationScreen
      nickname="모카번"
      value={value}
      onChange={setValue}
      pending={false}
      serverError={serverError}
      onSubmit={onSubmit}
      onBack={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.mocked(useKeyboardInset).mockReturnValue(0);
  graphemes.canSegment = true;
});

describe("ApplyScreen", () => {
  it("신청하기 머리 줄과 그룹 이름, 그룹장 닉네임, 3일 안내를 보인다", () => {
    renderScreen(<ApplyHarness />);
    expect(screen.getByRole("heading", { level: 1, name: "신청하기" })).toBeInTheDocument();
    expect(screen.getByText("새벽 5시 기상 공시반에 신청할게요")).toBeInTheDocument();
    expect(
      screen.getByText("그룹장 옥수수라떼님이 소개 글을 보고 수락하면 멤버가 돼요"),
    ).toBeInTheDocument();
    expect(screen.getByText("그룹장이 3일 안에 답하지 않으면 신청이 취소돼요")).toBeInTheDocument();
    expect(screen.getByTestId("write-screen")).toHaveAttribute("data-tone", "light");
  });

  it("열리면 입력칸에 포커스가 간다", () => {
    renderScreen(<ApplyHarness />);
    expect(screen.getByRole("textbox", { name: "소개 글" })).toHaveFocus();
  });

  it("키보드가 올라오면 보내는 버튼이 키보드 바로 위로 간다", () => {
    vi.mocked(useKeyboardInset).mockReturnValue(336);
    renderScreen(<ApplyHarness />);
    const bar = screen.getByTestId("write-submit-bar");
    expect(bar).toHaveAttribute("data-keyboard-inset", "336");
    // 키보드 윗면에서 12px 띄워 버튼이 키보드에 붙어 보이지 않게 한다.
    expect(bar).toHaveStyle({ bottom: "348px" });
  });

  it("키보드가 없으면 보내는 버튼은 화면 아래에 남는다", () => {
    renderScreen(<ApplyHarness />);
    expect(screen.getByTestId("write-submit-bar")).toHaveAttribute("data-keyboard-inset", "0");
  });

  it("50자를 넘으면 자르지 않고 안내하며 보내기를 막는다", async () => {
    renderScreen(<ApplyHarness />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "소개 글" }), "가".repeat(51));
    expect(screen.getByRole("textbox", { name: "소개 글" })).toHaveValue("가".repeat(51));
    expect(screen.getByRole("alert")).toHaveTextContent("50자까지 쓸 수 있어요");
    expect(screen.getByText("51/50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "신청 보내기" })).toBeDisabled();
  });

  it("공백만 쓰면 신청을 보낼 수 없다", async () => {
    renderScreen(<ApplyHarness />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "소개 글" }), "   ");
    expect(screen.getByRole("button", { name: "신청 보내기" })).toBeDisabled();
  });

  it("연락처가 보이면 안내만 하고 보내기는 막지 않는다", async () => {
    renderScreen(<ApplyHarness />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "소개 글" }), "카톡 abc123");
    expect(screen.getByText("연락처나 링크는 보낼 수 없어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "신청 보내기" })).toBeEnabled();
  });

  it("50자를 넘은 글에 연락처도 있으면 글자 수 안내 한 줄만 보인다", async () => {
    renderScreen(<ApplyHarness />);
    await userEvent
      .setup()
      .type(screen.getByRole("textbox", { name: "소개 글" }), `카톡 abc123 ${"가".repeat(45)}`);
    expect(screen.getByRole("alert")).toHaveTextContent("50자까지 쓸 수 있어요");
    expect(screen.queryByText("연락처나 링크는 보낼 수 없어요")).toBeNull();
  });

  it("서버가 막으면 입력칸 아래에 그 문장을 한 줄로 보이고 보내기는 막지 않는다", () => {
    renderScreen(<ApplyHarness serverError="연락처나 링크는 보낼 수 없어요" />);
    expect(screen.getByRole("alert")).toHaveTextContent("연락처나 링크는 보낼 수 없어요");
    expect(screen.getByRole("textbox", { name: "소개 글" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("서버 문장은 입력 중의 연락처 안내 대신 보이고 글자 수 안내보다는 뒤다", async () => {
    renderScreen(<ApplyHarness serverError="서버가 막은 문장" />);
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "소개 글" });
    await user.type(field, "카톡 abc123");
    expect(screen.getByRole("alert")).toHaveTextContent("서버가 막은 문장");
    expect(screen.queryByText("연락처나 링크는 보낼 수 없어요")).toBeNull();
    await user.clear(field);
    await user.type(field, "가".repeat(51));
    expect(screen.getByRole("alert")).toHaveTextContent("50자까지 쓸 수 있어요");
  });

  it("글자 단위로 셀 수 없는 환경에서는 50자를 넘어도 보낼 수 있다", async () => {
    graphemes.canSegment = false;
    renderScreen(<ApplyHarness />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "소개 글" }), "가".repeat(51));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "신청 보내기" })).toBeEnabled();
  });

  it("쓴 글을 보내면 넘긴다", async () => {
    const onSubmit = vi.fn();
    renderScreen(<ApplyHarness onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "소개 글" }), "새벽 5시에 꾸준히 나올게요");
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("보내는 중에는 버튼을 누를 수 없다", () => {
    renderScreen(<ApplyHarness pending />);
    expect(screen.getByRole("button", { name: "신청 보내기" })).toBeDisabled();
  });
});

describe("ReportApplicationScreen", () => {
  it("신청 신고는 밝은 모양이고 사유를 비워도 빨간 신고하기로 보낼 수 있다", async () => {
    const onSubmit = vi.fn();
    renderScreen(<ReportApplicationHarness onSubmit={onSubmit} />);
    expect(screen.getByTestId("write-screen")).toHaveAttribute("data-tone", "light");
    expect(screen.getByRole("heading", { level: 1, name: "신고하기" })).toBeInTheDocument();
    expect(screen.getByText("모카번님의 신청을 신고할게요")).toBeInTheDocument();
    expect(screen.getByText("신고하면 이 신청은 바로 거절돼요")).toBeInTheDocument();
    expect(screen.getByText("허위로 신고하면 이용이 제한될 수 있어요")).toBeInTheDocument();
    const reason = screen.getByRole("textbox", { name: "신고 사유" });
    expect(reason).toHaveFocus();
    expect(reason).toHaveAttribute("placeholder", "어떤 점이 문제인지 적어 주세요");
    await userEvent.setup().click(screen.getByRole("button", { name: "신고하기" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("신고 사유는 100자까지이고 연락처는 따로 안내하지 않는다", async () => {
    renderScreen(<ReportApplicationHarness />);
    const user = userEvent.setup();
    const reason = screen.getByRole("textbox", { name: "신고 사유" });
    await user.type(reason, "카톡 abc123");
    expect(screen.queryByText("연락처나 링크는 보낼 수 없어요")).toBeNull();
    await user.clear(reason);
    await user.type(reason, "가".repeat(101));
    expect(screen.getByRole("alert")).toHaveTextContent("100자까지 쓸 수 있어요");
    expect(screen.getByRole("button", { name: "신고하기" })).toBeDisabled();
  });
});

describe("신고 화면의 서버 문장", () => {
  it("신청 신고는 서버가 막은 문장을 입력칸 아래에 보인다", () => {
    renderScreen(<ReportApplicationHarness serverError="잠시 후 다시 시도해 주세요" />);
    expect(screen.getByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
  });

  it("공부방 신고도 서버가 막은 문장을 입력칸 아래에 보인다", () => {
    renderScreen(
      <ReportMemberScreen
        nickname="새벽러"
        value=""
        onChange={vi.fn()}
        pending={false}
        serverError="잠시 후 다시 시도해 주세요"
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
  });
});

describe("ReportMemberScreen", () => {
  afterEach(() => {
    cleanup();
    resetGlassChrome();
  });

  it("신고 사유는 비워도 보낼 수 있고, 공부방 신고는 어두운 모양이다", () => {
    renderScreen(
      <ReportMemberScreen
        nickname="새벽러"
        value=""
        onChange={vi.fn()}
        pending={false}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("새벽러님을 신고할게요")).toBeInTheDocument();
    expect(screen.getByText("신고하면 새벽러님의 화면을 볼 수 없어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "신고하기" })).toBeEnabled();
    expect(screen.getByTestId("write-screen")).toHaveAttribute("data-tone", "dark");
  });

  it("공부방 위에 뜨므로 앱 모드에서도 앱 머리 줄을 띄우지 않고 웹 뒤로 버튼을 쓴다", async () => {
    const postMessage = enterGlassChrome("/live-room/1");
    const onBack = vi.fn();
    renderScreen(
      <ReportMemberScreen
        nickname="새벽러"
        value=""
        onChange={vi.fn()}
        pending={false}
        onSubmit={vi.fn()}
        onBack={onBack}
      />,
    );
    const sentTypes = postMessage.mock.calls.map(
      ([raw]) => (JSON.parse(raw as string) as { type: string }).type,
    );
    expect(sentTypes).not.toContain("set-glass-chrome");
    expect(screen.getByRole("heading", { level: 1, name: "신고하기" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
