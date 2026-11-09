import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomeV3Content, type HomeV3ContentProps } from "../HomeV3Content";
import { HomeGoalSheet } from "../HomeGoalSheet";
import i18n from "@/lib/i18n";

function props(): HomeV3ContentProps {
  return {
    band: { status: "success", value: { kind: "mission", step: 1, ready: true, progress: 0 } },
    stats: {
      status: "success",
      value: { studySeconds: 15512, focusSeconds: 13337, focusRate: 86 },
    },
    subjects: { status: "success", value: [{ id: 1, name: "Math", colorIndex: 0 }] },
    selectedSubjectId: null,
    timelapseCount: 2,
    appLockLabel: "4 apps blocked",
    actions: {
      selectSubject: vi.fn(),
      startStudy: vi.fn(),
      openPlanner: vi.fn(),
      completeMission: vi.fn(),
      editGoal: vi.fn(),
      openTimelapses: vi.fn(),
      openTimelapseSettings: vi.fn(),
      openAppLock: vi.fn(),
    },
  };
}

describe("HomeV3Content", () => {
  it("keeps the step until the server acknowledgement arrives", async () => {
    const input = props();
    const { rerender } = render(<HomeV3Content {...input} />);
    expect(
      screen.getByRole("region", { name: i18n.t("home:v3.mission.caption") }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.mission.complete") }));
    expect(input.actions.completeMission).toHaveBeenCalledWith(1);
    expect(screen.getByText(i18n.t("home:v3.mission.subject"))).toBeInTheDocument();
    rerender(<HomeV3Content {...input} completingMission missionError="failed" />);
    expect(
      screen.getByRole("button", { name: i18n.t("home:v3.mission.completing") }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("failed");
  });

  it("picks a subject through the accessible menu and sends start separately", async () => {
    const input = props();
    render(<HomeV3Content {...input} />);
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.subject.choose") }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Math" }));
    expect(input.actions.selectSubject).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.startStudy") }));
    expect(input.actions.startStudy).toHaveBeenCalledOnce();
  });

  it("scrolls only the subject list so no-subject and add stay reachable", async () => {
    const subjects = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Subject ${i + 1}`,
      colorIndex: i,
    }));
    render(<HomeV3Content {...props()} subjects={{ status: "success", value: subjects }} />);
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.subject.choose") }));
    const list = await screen.findByTestId("home-subject-list");
    for (const subject of subjects) {
      expect(list).toContainElement(screen.getByRole("menuitem", { name: subject.name }));
    }
    expect(list).not.toContainElement(
      screen.getByRole("menuitem", { name: i18n.t("home:v3.subject.none") }),
    );
    expect(list).not.toContainElement(
      screen.getByRole("menuitem", { name: i18n.t("home:v3.subject.add") }),
    );
  });

  it("moves keyboard focus from the last subject past the scroll list", async () => {
    const subjects = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Subject ${i + 1}`,
      colorIndex: i,
    }));
    render(<HomeV3Content {...props()} subjects={{ status: "success", value: subjects }} />);
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.subject.choose") }));
    const last = await screen.findByRole("menuitem", { name: "Subject 8" });
    act(() => last.focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: i18n.t("home:v3.subject.none") })).toHaveFocus();
  });

  it("keeps study start usable when stats and progress fail", async () => {
    const input = props();
    render(
      <HomeV3Content
        {...input}
        stats={{ status: "error", retry: vi.fn() }}
        band={{ status: "error", retry: vi.fn() }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.startStudy") }));
    expect(input.actions.startStudy).toHaveBeenCalledOnce();
    expect(screen.queryByText("0:00:00")).not.toBeInTheDocument();
  });

  it("opens the saved goal editor from the goal band", async () => {
    const input = props();
    render(
      <HomeV3Content
        {...input}
        band={{
          status: "success",
          value: { kind: "goal", targetSeconds: 28800, remainingSeconds: 15463, percent: 46 },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.change") }));
    expect(input.actions.editGoal).toHaveBeenCalledOnce();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "46");
  });
});

describe("HomeGoalSheet", () => {
  it.each([
    { steps: [], wantSeconds: 36900, wantLabel: "10시간 15분" },
    { steps: ["increase"], wantSeconds: 38700, wantLabel: "10시간 45분" },
    { steps: ["increase", "decrease"], wantSeconds: 36900, wantLabel: "10시간 15분" },
  ])(
    "유효한 기존 목표의 초값을 보존한다: $steps → $wantSeconds",
    async ({ steps, wantSeconds, wantLabel }) => {
      const save = vi.fn().mockResolvedValue({ defaultSaved: true });
      render(<HomeGoalSheet open onOpenChange={vi.fn()} initialSeconds={36900} onSave={save} />);
      for (const step of steps) {
        await userEvent.click(
          screen.getByRole("button", {
            name: i18n.t(step === "increase" ? "planner:goal.increase" : "planner:goal.decrease"),
          }),
        );
      }
      expect(screen.getByRole("status", { name: wantLabel })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.save") }));
      expect(save).toHaveBeenCalledWith({
        seconds: wantSeconds,
        asDefault: true,
        defaultOnly: false,
      });
    },
  );

  it("10시간에서 30분을 늘리면 소수가 아닌 시간·분 단위로 표시한다", async () => {
    render(<HomeGoalSheet open onOpenChange={vi.fn()} initialSeconds={36000} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: i18n.t("planner:goal.increase") }));
    expect(screen.queryByText("10.5")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "10시간 30분" })).toHaveTextContent("10시간30분");
  });

  it("starts with daily default enabled and preserves explicit zero", async () => {
    const save = vi.fn().mockResolvedValue({ defaultSaved: true });
    const close = vi.fn();
    render(<HomeGoalSheet open onOpenChange={close} initialSeconds={0} onSave={save} />);
    expect(screen.getByRole("status", { name: "0분" })).toHaveTextContent("0분");
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("button", { name: i18n.t("planner:goal.decrease") })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.save") }));
    expect(save).toHaveBeenCalledWith({ seconds: 0, asDefault: true, defaultOnly: false });
    expect(close).toHaveBeenCalledWith(false);
  });

  it("uses 30-minute steps and caps the goal at 24h", async () => {
    const save = vi.fn().mockResolvedValue({ defaultSaved: true });
    render(<HomeGoalSheet open onOpenChange={vi.fn()} initialSeconds={84600} onSave={save} />);
    expect(screen.getByRole("status", { name: "23시간 30분" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: i18n.t("planner:goal.increase") }));
    expect(screen.getByRole("status", { name: "24시간" })).toHaveTextContent("24시간");
    expect(screen.getByRole("button", { name: i18n.t("planner:goal.increase") })).toBeDisabled();
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.save") }));
    expect(save).toHaveBeenCalledWith({ seconds: 86400, asDefault: false, defaultOnly: false });
  });

  it.each([4, 6, 8, 10])("%i시간 프리셋을 같은 시간 단위로 표시하고 저장한다", async (hours) => {
    const save = vi.fn().mockResolvedValue({ defaultSaved: true });
    render(<HomeGoalSheet open onOpenChange={vi.fn()} initialSeconds={0} onSave={save} />);
    const preset = screen.getByRole("button", { name: `${hours}시간` });
    await userEvent.click(preset);
    expect(preset).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status", { name: `${hours}시간` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.save") }));
    expect(save).toHaveBeenCalledWith({
      seconds: hours * 3600,
      asDefault: true,
      defaultOnly: false,
    });
  });

  it("저장 중 입력·중복 저장·닫기를 막고 실제 응답을 받은 뒤 닫는다", async () => {
    let finish!: () => void;
    const save = vi.fn(
      () =>
        new Promise<{ defaultSaved: boolean }>((resolve) => {
          finish = () => resolve({ defaultSaved: true });
        }),
    );
    const close = vi.fn();
    render(<HomeGoalSheet open onOpenChange={close} initialSeconds={28800} onSave={save} />);
    const button = screen.getByRole("button", { name: i18n.t("home:v3.goal.save") });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: i18n.t("planner:goal.decrease") })).toBeDisabled();
    expect(screen.getByRole("button", { name: i18n.t("planner:goal.increase") })).toBeDisabled();
    expect(screen.getByRole("button", { name: "4시간" })).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("retries only the default after a partial save and guards duplicate submits", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ defaultSaved: false })
      .mockResolvedValueOnce({ defaultSaved: true });
    render(<HomeGoalSheet open onOpenChange={vi.fn()} initialSeconds={28800} onSave={save} />);
    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.save") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("home:v3.goal.defaultFailed"),
    );
    expect(screen.getByRole("button", { name: i18n.t("planner:goal.increase") })).toBeDisabled();
    expect(screen.getByRole("button", { name: "4시간" })).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("home:v3.goal.retryDefault") }),
    );
    expect(save).toHaveBeenLastCalledWith({ seconds: 28800, asDefault: true, defaultOnly: true });
  });

  it("retains the sheet after a failed date save", async () => {
    const close = vi.fn();
    render(
      <HomeGoalSheet
        open
        onOpenChange={close}
        initialSeconds={28800}
        onSave={vi.fn().mockRejectedValue(new Error("failed"))}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.goal.save") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("home:v3.goal.saveFailed"));
    expect(close).not.toHaveBeenCalled();
  });
});
