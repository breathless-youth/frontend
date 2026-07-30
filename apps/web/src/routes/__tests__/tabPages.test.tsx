import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("탭 라우트 골격", () => {
  it("/home 이 홈 골격을 띄운다", () => {
    renderAt("/home?userId=7");
    expect(screen.getByTestId("home-tab-page")).toBeInTheDocument();
  });

  it("/records 가 기록 골격을 띄운다", () => {
    renderAt("/records");
    expect(screen.getByTestId("records-page")).toBeInTheDocument();
  });

  it("/settings 가 설정 골격을 띄운다", () => {
    renderAt("/settings");
    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });

  it("/home?userId=7 에서는 userId 없음 문구가 보이지 않는다", () => {
    renderAt("/home?userId=7");
    expect(screen.queryByText(/userId 없음/)).not.toBeInTheDocument();
  });

  it("/home 에 userId 없이 접속하면 userId 없음 문구가 보인다", () => {
    renderAt("/home");
    expect(screen.getByText(/userId 없음/)).toBeInTheDocument();
  });
});
