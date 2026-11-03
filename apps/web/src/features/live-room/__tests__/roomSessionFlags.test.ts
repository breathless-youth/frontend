import { describe, expect, it } from "vitest";

import {
  BREAK_STATE,
  FOCUS_STATE,
  distractionState,
  pauseState,
} from "@/features/study-session/sessionState";

import { roomSessionFlags, visionPreview } from "../roomSessionFlags";

describe("roomSessionFlags", () => {
  it("휴식 중에는 영상을 보내고 측정만 멈춘다", () => {
    expect(roomSessionFlags(BREAK_STATE)).toEqual({
      cameraHeld: false,
      trackEnabled: true,
      detecting: false,
      onBreak: true,
    });
  });

  it("카메라를 꺼 멈춘 동안은 영상을 보내지 않는다", () => {
    expect(roomSessionFlags(pauseState("MANUAL"))).toEqual({
      cameraHeld: true,
      trackEnabled: false,
      detecting: false,
      onBreak: false,
    });
    expect(roomSessionFlags(pauseState("BACKGROUND"))).toEqual({
      cameraHeld: true,
      trackEnabled: false,
      detecting: false,
      onBreak: false,
    });
    expect(roomSessionFlags(FOCUS_STATE)).toEqual({
      cameraHeld: false,
      trackEnabled: true,
      detecting: true,
      onBreak: false,
    });
  });

  it("딴짓 중에도 영상은 보내고 감지는 이어 간다", () => {
    expect(roomSessionFlags(distractionState("PHONE"))).toEqual({
      cameraHeld: false,
      trackEnabled: true,
      detecting: true,
      onBreak: false,
    });
  });
});

describe("visionPreview", () => {
  const base = {
    detectionEnabled: false,
    faceMaskOn: true,
    cameraDialogOpen: false,
    onBreak: false,
    studying: true,
  };

  it("휴식 중 얼굴 가림이 켜져 있으면 이모지 자리를 계속 구한다", () => {
    expect(visionPreview({ ...base, onBreak: true })).toBe(true);
  });

  it("얼굴 가림을 끄면 휴식 중에도 감지를 멈춘다", () => {
    expect(visionPreview({ ...base, onBreak: true, faceMaskOn: false })).toBe(false);
  });

  it("카메라를 꺼 멈춘 동안은 켜기 창이 없으면 구하지 않는다", () => {
    expect(visionPreview(base)).toBe(false);
  });

  it("카메라 켜기 창이 열려 있고 얼굴 가림이 켜져 있으면 구한다", () => {
    expect(visionPreview({ ...base, cameraDialogOpen: true })).toBe(true);
    expect(visionPreview({ ...base, cameraDialogOpen: true, faceMaskOn: false })).toBe(false);
  });

  it("측정 중에는 전체 감지가 이모지 자리도 구해서 미리보기 감지를 따로 돌리지 않는다", () => {
    expect(visionPreview({ ...base, detectionEnabled: true, onBreak: true })).toBe(false);
  });

  it("세션이 끝나는 중에는 휴식이어도 구하지 않는다", () => {
    expect(visionPreview({ ...base, onBreak: true, studying: false })).toBe(false);
  });
});
