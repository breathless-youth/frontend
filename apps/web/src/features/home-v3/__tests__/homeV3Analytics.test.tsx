import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { trackHomeShortcutTapped, trackHomeSubjectSelected } from "@/lib/amplitude";

import { HomeContactBubble } from "../HomeContactBubble";
import { HomePlannerShortcut, HomeUtilityShortcuts } from "../HomeShortcuts";
import { HomeSubjectSelect } from "../HomeSubjectSelect";

vi.mock("@/lib/amplitude", () => ({
  trackHomeShortcutTapped: vi.fn(),
  trackHomeSubjectSelected: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(trackHomeShortcutTapped).mockReset();
  vi.mocked(trackHomeSubjectSelected).mockReset();
});

afterEach(cleanup);

it("플래너 바로가기를 누르면 플래너 대상으로 한 번 기록한다", async () => {
  const onOpen = vi.fn();
  render(<HomePlannerShortcut plannerTaskCount={2} onOpen={onOpen} />);

  await userEvent.click(screen.getByRole("button"));

  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(trackHomeShortcutTapped).toHaveBeenCalledTimes(1);
  expect(trackHomeShortcutTapped).toHaveBeenCalledWith("planner");
});

it("타임랩스·타임랩스 설정·앱 잠금 바로가기를 각각 대상과 함께 기록한다", async () => {
  const actions = {
    openTimelapses: vi.fn(),
    openTimelapseSettings: vi.fn(),
    openAppLock: vi.fn(),
  };
  render(<HomeUtilityShortcuts timelapseCount={1} appLockLabel="꺼짐" actions={actions} />);
  const [timelapse, settings, appLock] = screen.getAllByRole("button");

  await userEvent.click(timelapse!);
  await userEvent.click(settings!);
  await userEvent.click(appLock!);

  expect(vi.mocked(trackHomeShortcutTapped).mock.calls).toEqual([
    ["timelapse"],
    ["timelapse_settings"],
    ["app_lock"],
  ]);
  expect(actions.openTimelapses).toHaveBeenCalledTimes(1);
  expect(actions.openTimelapseSettings).toHaveBeenCalledTimes(1);
  expect(actions.openAppLock).toHaveBeenCalledTimes(1);
});

it("문의 말풍선을 누르면 문의 대상으로 한 번 기록하고 상담 화면을 연다", async () => {
  const onOpen = vi.fn();
  render(<HomeContactBubble onOpen={onOpen} />);

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  // 보이는 말풍선 문구가 이름 안에 있어야 음성 제어로 화면 문구를 말해 누를 수 있다.
  await userEvent.click(
    screen.getByRole("button", { name: "불편한 점이 있으면 바로 알려 주세요 문의하기" }),
  );

  expect(trackHomeShortcutTapped).toHaveBeenCalledTimes(1);
  expect(trackHomeShortcutTapped).toHaveBeenCalledWith("contact");
  expect(onOpen).toHaveBeenCalledTimes(1);
});

function renderSubjectSelect() {
  const onSelect = vi.fn();
  const onAdd = vi.fn();
  render(
    <HomeSubjectSelect
      subjects={{ status: "success", value: [{ id: 3, name: "영어", colorIndex: 1 }] }}
      subjectId={null}
      starting={false}
      menuOpen
      onSelect={onSelect}
      onAdd={onAdd}
    />,
  );
  return { onSelect, onAdd };
}

it("홈에서 과목을 고르면 과목이 있다고 기록하고 이름은 보내지 않는다", async () => {
  const { onSelect } = renderSubjectSelect();

  await userEvent.click(screen.getByRole("menuitem", { name: "영어" }));

  expect(onSelect).toHaveBeenCalledWith(3);
  expect(vi.mocked(trackHomeSubjectSelected).mock.calls).toEqual([[true]]);
});

it("홈에서 과목 없음을 고르면 과목이 없다고 기록한다", async () => {
  const { onSelect } = renderSubjectSelect();

  await userEvent.click(screen.getByRole("menuitem", { name: "과목 없음" }));

  expect(onSelect).toHaveBeenCalledWith(null);
  expect(vi.mocked(trackHomeSubjectSelected).mock.calls).toEqual([[false]]);
});

it("과목 추가를 누르면 과목 선택으로 기록하지 않는다", async () => {
  const { onAdd } = renderSubjectSelect();

  await userEvent.click(screen.getByRole("menuitem", { name: /과목 추가/ }));

  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(trackHomeSubjectSelected).not.toHaveBeenCalled();
});
