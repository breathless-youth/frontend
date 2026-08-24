import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WebrtcLoopbackPage } from "../WebrtcLoopbackPage";

describe("WebrtcLoopbackPage", () => {
  it("RTCPeerConnection이 없으면 미지원 안내를 보여준다", () => {
    render(<WebrtcLoopbackPage />);

    expect(screen.getByText(/이 환경에서는 WebRTC를 지원하지 않아요/)).toBeInTheDocument();
  });
});
