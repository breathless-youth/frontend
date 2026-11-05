import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GroupLoginGate } from "../GroupLoginGate";
import { useGroupAccess } from "../useGroupAccess";

vi.mock("../useGroupAccess", () => ({ useGroupAccess: vi.fn() }));
vi.mock("../GroupLoginScreen", () => ({
  GroupLoginScreen: ({ entry }: { entry: string }) => <p>로그인 화면 {entry}</p>,
}));

afterEach(() => {
  vi.mocked(useGroupAccess).mockReset();
});

function renderGate() {
  render(
    <MemoryRouter initialEntries={["/social/groups/11"]}>
      <Routes>
        <Route element={<GroupLoginGate entry="group" />}>
          <Route path="/social/groups/:groupId" element={<p>그룹 홈</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("GroupLoginGate", () => {
  it("비회원이면 그 자리에 로그인 화면을 그린다", () => {
    vi.mocked(useGroupAccess).mockReturnValue("guest");
    renderGate();
    expect(screen.getByText("로그인 화면 group")).toBeInTheDocument();
    expect(screen.queryByText("그룹 홈")).not.toBeInTheDocument();
  });

  it.each(["member", "ungated"] as const)("%s이면 원래 화면을 그린다", (access) => {
    vi.mocked(useGroupAccess).mockReturnValue(access);
    renderGate();
    expect(screen.getByText("그룹 홈")).toBeInTheDocument();
  });

  it("판정 전에는 아무것도 그리지 않는다", () => {
    vi.mocked(useGroupAccess).mockReturnValue("pending");
    renderGate();
    expect(screen.queryByText("그룹 홈")).not.toBeInTheDocument();
    expect(screen.queryByText(/로그인 화면/)).not.toBeInTheDocument();
  });

  it("감싼 화면이 있으면 그 화면을 그린다", () => {
    vi.mocked(useGroupAccess).mockReturnValue("member");
    render(
      <MemoryRouter>
        <GroupLoginGate entry="tab">
          <p>그룹 탭</p>
        </GroupLoginGate>
      </MemoryRouter>,
    );
    expect(screen.getByText("그룹 탭")).toBeInTheDocument();
  });
});
