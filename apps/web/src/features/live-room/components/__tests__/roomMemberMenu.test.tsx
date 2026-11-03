import * as Sentry from "@sentry/react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoomMemberMenu } from "../RoomMemberMenu";

type MenuProps = ComponentProps<typeof RoomMemberMenu>;

function menuProps(overrides: Partial<MenuProps> = {}): MenuProps {
  return {
    nickname: "새벽러",
    volume: 1,
    muted: false,
    canKick: false,
    placement: "below",
    open: true,
    container: null,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    onReport: vi.fn(),
    onKick: vi.fn(),
    ...overrides,
  };
}

/** 열림을 직접 들고 있는 호출부처럼 열고 닫는다. */
function StatefulMenu(props: Partial<MenuProps>) {
  const [open, setOpen] = useState(false);
  return (
    <RoomMemberMenu
      {...menuProps(props)}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    />
  );
}

describe("RoomMemberMenu", () => {
  it("닉네임, 음량, 소리 끄기, 신고하기 순서이고 그룹장에게만 내보내기가 있다", () => {
    const { rerender } = render(<RoomMemberMenu {...menuProps({ canKick: false })} />);
    const menu = screen.getByRole("menu");
    const nickname = screen.getByText("새벽러");
    const slider = screen.getByRole("slider", { name: "새벽러님 음량" });

    expect(menu).toContainElement(nickname);
    expect(
      nickname.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      slider.compareDocumentPosition(screen.getAllByRole("menuitem")[0]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(slider).toHaveValue("100");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "소리 끄기",
      "신고하기",
    ]);

    rerender(<RoomMemberMenu {...menuProps({ canKick: true })} />);

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "소리 끄기",
      "신고하기",
      "그룹에서 내보내기",
    ]);
  });

  it("음량 슬라이더는 0과 1 사이 값으로 넘기고 소리를 끈 사람에게는 소리 켜기다", () => {
    const onVolumeChange = vi.fn();
    const { rerender } = render(<RoomMemberMenu {...menuProps({ onVolumeChange })} />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "95" } });
    expect(onVolumeChange).toHaveBeenLastCalledWith(expect.closeTo(0.95, 2));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(onVolumeChange).toHaveBeenLastCalledWith(0);

    rerender(<RoomMemberMenu {...menuProps({ muted: true, volume: 0.4 })} />);
    expect(screen.getByRole("menuitem", { name: "소리 켜기" })).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveValue("40");
  });

  it("가로에서는 위로 펼친다", () => {
    render(<RoomMemberMenu {...menuProps({ placement: "above" })} />);

    expect(screen.getByRole("menu")).toHaveAttribute("data-placement", "above");
  });

  it("메뉴 버튼은 닉네임 메뉴로 읽히고 눌러야 열린다", async () => {
    const onOpen = vi.fn();
    render(<RoomMemberMenu {...menuProps({ open: false, onOpen })} />);
    const button = screen.getByRole("button", { name: "새벽러 메뉴" });

    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.setup().click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("메뉴 버튼 누름은 화면 탭 토글로 번지지 않는다", () => {
    const onSurfacePointerDown = vi.fn();
    render(
      <div onPointerDown={onSurfacePointerDown}>
        <RoomMemberMenu {...menuProps({ open: false })} />
      </div>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "새벽러 메뉴" }));

    expect(onSurfacePointerDown).not.toHaveBeenCalled();
  });

  it("Esc를 누르면 닫는다", async () => {
    const onClose = vi.fn();
    render(<RoomMemberMenu {...menuProps({ onClose })} />);

    await userEvent.setup().keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("소리 끄기를 고르면 그 사람 소리를 끄고 메뉴를 닫는다", async () => {
    const onToggleMute = vi.fn();
    const user = userEvent.setup();
    render(<StatefulMenu onToggleMute={onToggleMute} />);

    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "소리 끄기" }));

    expect(onToggleMute).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("신고하기를 고르면 메뉴를 닫고 메뉴 버튼에 포커스를 돌려준 뒤 신고를 넘긴다", async () => {
    let focusedAtReport: Element | null = null;
    const onReport = vi.fn(() => {
      focusedAtReport = document.activeElement;
    });
    const user = userEvent.setup();
    render(<StatefulMenu onReport={onReport} />);

    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "신고하기" }));

    expect(onReport).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(focusedAtReport).toBe(screen.getByRole("button", { name: "새벽러 메뉴" }));
  });

  it("그룹에서 내보내기를 고르면 메뉴를 닫은 뒤 내보내기를 넘긴다", async () => {
    const onKick = vi.fn();
    const user = userEvent.setup();
    render(<StatefulMenu canKick onKick={onKick} />);

    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "그룹에서 내보내기" }));

    expect(onKick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("메뉴 창은 닉네임이 클릭 분석에 실리지 않게 가린다", () => {
    render(<RoomMemberMenu {...menuProps()} />);
    const menu = screen.getByRole("menu");

    expect(menu).toHaveAttribute("data-amp-mask");
    expect(menu).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });

  it("키보드로 열면 음량 슬라이더부터 고를 수 있다", async () => {
    const onVolumeChange = vi.fn();
    const user = userEvent.setup();
    render(<StatefulMenu onVolumeChange={onVolumeChange} />);
    screen.getByRole("button", { name: "새벽러 메뉴" }).focus();

    await user.keyboard("{Enter}");
    const slider = screen.getByRole("slider", { name: "새벽러님 음량" });
    expect(slider).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "소리 끄기" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(slider).toHaveFocus();

    // 음량을 바꾸려고 고르는 동작은 메뉴를 닫지 않는다.
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: "35" } });
    expect(onVolumeChange).toHaveBeenLastCalledWith(expect.closeTo(0.35, 2));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "소리 끄기",
      "신고하기",
    ]);
  });

  it("음량 슬라이더를 눌러도 메뉴가 닫히지 않는다", async () => {
    const user = userEvent.setup();
    render(<StatefulMenu />);
    await user.click(screen.getByRole("button", { name: "새벽러 메뉴" }));

    await user.click(screen.getByRole("slider", { name: "새벽러님 음량" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("RoomMemberMenu의 Sentry 클릭 기록", () => {
  let breadcrumbs: Sentry.Breadcrumb[] = [];

  beforeEach(() => {
    breadcrumbs = [];
    // 운영과 같은 클릭 기록 통합을 그대로 쓰고, 클릭 기록과 무관한 계측만 끈다.
    const client = new Sentry.BrowserClient({
      dsn: "https://key@o0.ingest.example.test/123",
      integrations: [
        Sentry.breadcrumbsIntegration({
          console: false,
          fetch: false,
          history: false,
          sentry: false,
          xhr: false,
        }),
      ],
      beforeBreadcrumb: (breadcrumb) => {
        breadcrumbs.push(breadcrumb);
        return breadcrumb;
      },
      stackParser: Sentry.defaultStackParser,
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
    });
    Sentry.getCurrentScope().setClient(client);
    client.init();
  });

  afterEach(async () => {
    const client = Sentry.getClient();
    Sentry.getCurrentScope().setClient(undefined);
    await client?.close();
  });

  const clicks = () => breadcrumbs.filter((breadcrumb) => breadcrumb.category === "ui.click");

  it("메뉴 버튼은 닉네임 대신 컴포넌트 이름이 남는다", () => {
    render(<RoomMemberMenu {...menuProps({ open: false })} />);

    fireEvent.click(screen.getByRole("button", { name: "새벽러 메뉴" }));

    expect(clicks()).toHaveLength(1);
    expect(clicks()[0]!.message).toContain("RoomMemberMenu");
    expect(clicks()[0]!.message).not.toContain("새벽러");
  });

  it("음량 슬라이더는 닉네임 대신 컴포넌트 이름이 남는다", () => {
    render(<RoomMemberMenu {...menuProps()} />);

    fireEvent.click(screen.getByRole("slider", { name: "새벽러님 음량" }));

    expect(clicks()).toHaveLength(1);
    expect(clicks()[0]!.message).toContain("RoomMemberVolume");
    expect(clicks()[0]!.message).not.toContain("새벽러");
  });
});
