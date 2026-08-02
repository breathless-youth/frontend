import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";
import { CONTACT_FORM_URL } from "@/features/settings/settingsInfo";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/features/settings/legalDocuments";
import { OPEN_SOURCE_ENTRIES } from "@/features/settings/openSourceLicenses";

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

  it("/contact 의 iframe에서 error가 발생하면 실패 화면을 보여준다", () => {
    renderAt("/contact");
    const iframe = screen.getByTitle("문의하기");
    fireEvent.error(iframe);
    expect(screen.getByText("문의 폼을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("실패 화면에서 다시 시도를 누르면 실패 화면이 사라지고 iframe이 다시 렌더된다", () => {
    renderAt("/contact");
    fireEvent.error(screen.getByTitle("문의하기"));
    expect(screen.getByText("문의 폼을 불러오지 못했어요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.queryByText("문의 폼을 불러오지 못했어요")).not.toBeInTheDocument();
    expect(screen.getByTitle("문의하기")).toBeInTheDocument();
  });

  it("/licenses 가 고지 항목과 라이선스 전문을 렌더한다 (BY-310)", () => {
    renderAt("/licenses");
    expect(screen.getByRole("heading", { name: "Open Source Licenses" })).toBeInTheDocument();
    // 항목은 섹션·카드 없이 텍스트로 흘린다(2026-08-02 확정) — 이름 존재만 확인한다.
    for (const entry of OPEN_SOURCE_ENTRIES) {
      expect(screen.getByText(entry.name)).toBeInTheDocument();
    }
    // 전문은 원문 그대로 포함된다 — 원문에만 있는 마지막 줄로 존재를 확인한다(9KB 전체 매칭은 무의미).
    expect(screen.getByText(/END OF TERMS AND CONDITIONS/)).toBeInTheDocument();
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

  it("딥링크·새로고침으로 /terms에 곧장 진입하면(뒤로 갈 스택이 없으면) 설정으로 보낸다", () => {
    // 실제 앱은 BrowserRouter라 window.history.state.idx로 스택 깊이를 판단한다.
    // 새로고침·딥링크 직후에는 idx가 없으므로(진입 엔트리 1개) 그 상태를 그대로 재현한다.
    expect(window.history.state?.idx).toBeFalsy();

    renderAt("/terms");
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });
});
