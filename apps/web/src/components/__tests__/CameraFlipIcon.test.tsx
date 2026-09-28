import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CameraFlipIcon } from "../CameraFlipIcon";

describe("CameraFlipIcon", () => {
  it("색을 하드코딩하지 않고 부모 텍스트 색을 물려받는다", () => {
    const { container } = render(<CameraFlipIcon turns={0} />);
    const svg = container.querySelector("svg")!;
    expect(svg.innerHTML).not.toContain("white");
    expect(svg.querySelector('path[stroke="currentColor"]')).not.toBeNull();
  });
});
