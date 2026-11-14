import { describe, expect, it } from "vitest";

import { cameraBoxFrames } from "../cameraExpandMotion";

const FULL = { left: 0, top: 0, width: 402, height: 874 };
// 세로 화면 오른쪽 아래 108×144 작은 창(시안 23a)
const PIP = { left: 278, top: 582, width: 108, height: 144 };

describe("cameraBoxFrames", () => {
  it("작은 창 자리와 전체 화면 사이를 상자의 실제 위치·크기·둥글기로 오간다", () => {
    const [pip, full] = cameraBoxFrames(PIP, FULL, 8);

    expect(pip).toEqual({
      top: "582px",
      left: "278px",
      width: "108px",
      height: "144px",
      right: "auto",
      bottom: "auto",
      borderRadius: "8px",
    });
    expect(full).toEqual({
      top: "0px",
      left: "0px",
      width: "402px",
      height: "874px",
      right: "auto",
      bottom: "auto",
      borderRadius: "0px",
    });
  });

  it("세션 화면이 뷰포트에서 떨어져 있으면 그 안의 좌표로 바꾼다", () => {
    const [pip] = cameraBoxFrames(PIP, { ...FULL, left: 10, top: 20 }, 8);

    expect(pip).toMatchObject({ top: "562px", left: "268px" });
  });
});
