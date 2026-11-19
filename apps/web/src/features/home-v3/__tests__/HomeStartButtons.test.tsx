import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/sonner";
import { writeMeasureMode } from "@/features/measure-mode/measureMode";

import { HomeStartButtons } from "../HomeStartButtons";

vi.mock("@/lib/amplitude", () => ({ trackStudyMeasureModeChanged: vi.fn() }));

afterEach(() => {
  localStorage.clear();
  act(() => {
    toast.dismiss();
  });
});

it("측정 방식을 바꾸면 바뀐 방식을 토스트로 알린다", async () => {
  writeMeasureMode("camera");
  render(
    <>
      <HomeStartButtons starting={false} onStart={vi.fn()} />
      <Toaster />
    </>,
  );

  await userEvent.click(screen.getByRole("button", { name: "모드 바꾸기, 지금 관리 모드" }));
  expect(await screen.findByText("자율 모드: 카메라 없이 공부해요")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "모드 바꾸기, 지금 자율 모드" }));
  expect(await screen.findByText("관리 모드: 카메라로 순공 시간을 측정해요")).toBeInTheDocument();
  expect(screen.queryByText("자율 모드: 카메라 없이 공부해요")).not.toBeInTheDocument();
});
