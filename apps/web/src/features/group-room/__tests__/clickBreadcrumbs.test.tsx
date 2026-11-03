import * as Sentry from "@sentry/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeskGrid } from "../components/DeskGrid";
import { MemberMenu } from "../components/MemberMenu";
import { MyRoomCard } from "../components/MyRoomCard";
import { PendingApplicationsSheet } from "../components/PendingApplicationsSheet";
import { PublicRoomCard } from "../components/PublicRoomCard";
import { buildGroupRoomFixtures } from "../fixtures";

/**
 * 그룹 화면의 Sentry 클릭 기록
 *
 * Sentry는 누른 요소와 그 위 네 단계 조상의 aria-label을 클릭 기록에 적는다.
 * 그룹 이름이나 닉네임이 aria-label에 든 요소는 컴포넌트 이름으로 적혀서 클릭 기록에 이름이 남지 않아야 한다.
 */

const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);
const NAMES =
  /수능 D-200 밤샘반|새벽 5시 기상 공시반|새벽러|합격까지|고구마맛탕|연필깎이|열공곰|민준/;

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

describe("그룹 화면의 Sentry 클릭 기록", () => {
  it("내 그룹 카드는 어디를 눌러도 그룹 이름과 닉네임 대신 컴포넌트 이름이 남는다", () => {
    render(<MyRoomCard room={fixtures.myRooms[0]!} onOpen={vi.fn()} />);
    const card = screen.getByRole("button", { name: /수능 D-200 밤샘반/ });
    fireEvent.click(card);
    // 실제로 누르는 곳은 카드 안의 그룹 이름이나 책상 닉네임 글자일 때가 많다.
    fireEvent.click(within(card).getByText("수능 D-200 밤샘반"));
    fireEvent.click(within(card).getByText("새벽러"));

    expect(clicks()).toHaveLength(3);
    expect(clicks()[0]!.message).toContain("MyRoomCard");
    for (const click of clicks()) {
      expect(click.data?.["ui.component_name"]).toBe("MyRoomCard");
      expect(click.message).not.toMatch(NAMES);
    }
  });

  it("공개 그룹 카드는 그룹 이름 대신 컴포넌트 이름이 남는다", () => {
    render(<PublicRoomCard room={fixtures.publicRooms[0]!} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /새벽 5시 기상 공시반/ }));

    expect(clicks()).toHaveLength(1);
    expect(clicks()[0]!.message).toContain("PublicRoomCard");
    expect(clicks()[0]!.message).not.toMatch(NAMES);
  });

  it("신청 중 시트의 줄은 그룹 이름 대신 컴포넌트 이름이 남는다", () => {
    render(
      <PendingApplicationsSheet
        open
        onOpenChange={vi.fn()}
        applications={fixtures.pending}
        now={NOW}
        cancelingId={null}
        onCancel={vi.fn()}
        onOpenRoom={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /새벽 5시 기상 공시반/ }));

    expect(clicks()).toHaveLength(1);
    expect(clicks()[0]!.message).toContain("PendingApplicationRow");
    expect(clicks()[0]!.message).not.toMatch(NAMES);
  });

  it("멤버 줄의 메뉴 버튼은 닉네임 대신 컴포넌트 이름이 남는다", () => {
    render(<MemberMenu nickname="민준" onTransfer={vi.fn()} onKick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "민준 메뉴" }));

    expect(clicks()).toHaveLength(1);
    expect(clicks()[0]!.message).toContain("MemberMenu");
    expect(clicks()[0]!.message).not.toMatch(NAMES);
  });

  it("멤버 책상은 어디를 눌러도 닉네임 대신 컴포넌트 이름이 남는다", () => {
    render(
      <DeskGrid members={fixtures.roomHome.members} visibility="public" elapsedSec={0} now={NOW} />,
    );
    const desk = screen.getByRole("listitem", { name: /^새벽러,/ });
    const figure = desk.querySelector("svg");
    if (figure === null) {
      throw new Error("책상 그림이 없다");
    }
    // 책상 칸은 그림보다 넓어서 그림 옆 빈 곳을 누르면 칸 자체가 눌린다.
    fireEvent.click(desk);
    fireEvent.click(figure);
    fireEvent.click(within(desk).getByText("새벽러"));

    expect(clicks()).toHaveLength(3);
    expect(clicks()[0]!.message).toContain("MemberDesk");
    for (const click of clicks()) {
      expect(click.data?.["ui.component_name"]).toBe("MemberDesk");
      expect(click.message).not.toMatch(NAMES);
    }
  });
});
