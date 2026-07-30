import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";
import { CONTACT_FORM_URL } from "@/features/settings/settingsInfo";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/features/settings/legalDocuments";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("설정 하위 라우트", () => {
  it("/terms 가 이용약관 본문을 렌더한다", () => {
    renderAt("/terms");
    expect(screen.getByRole("heading", { name: TERMS_OF_SERVICE.title })).toBeInTheDocument();
    expect(screen.getByText(TERMS_OF_SERVICE.sections[0].heading)).toBeInTheDocument();
  });

  it("/privacy 가 개인정보처리방침 본문을 렌더한다", () => {
    renderAt("/privacy");
    expect(screen.getByRole("heading", { name: PRIVACY_POLICY.title })).toBeInTheDocument();
    expect(screen.getByText(PRIVACY_POLICY.sections[0].heading)).toBeInTheDocument();
  });

  it("/contact 가 문의 폼 iframe을 로딩 상태로 띄운다", () => {
    renderAt("/contact");
    expect(screen.getByText("문의 폼을 불러오는 중")).toBeInTheDocument();
    const iframe = screen.getByTitle("문의하기");
    expect(iframe).toHaveAttribute("src", CONTACT_FORM_URL);
  });

  it("/contact 의 iframe이 로드되면 로딩 표시가 사라진다", () => {
    renderAt("/contact");
    const iframe = screen.getByTitle("문의하기");
    fireEvent.load(iframe);
    expect(screen.queryByText("문의 폼을 불러오는 중")).not.toBeInTheDocument();
  });

  it("뒤로 가기 버튼을 누르면 이전 경로로 돌아간다", () => {
    render(
      <MemoryRouter initialEntries={["/settings", "/terms"]} initialIndex={1}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });
});
