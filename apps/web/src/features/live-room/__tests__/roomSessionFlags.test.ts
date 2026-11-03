import { describe, expect, it } from "vitest";

import {
  BREAK_STATE,
  FOCUS_STATE,
  distractionState,
  pauseState,
} from "@/features/study-session/sessionState";

import { roomSessionFlags } from "../roomSessionFlags";

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
