import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/features/settings/legalDocuments";

/**
 * S6 · 설정 화면 웹 이식 테스트 — RN 원본 `apps/mobile/__tests__/settings.test.tsx`를
 * 웹 상황(카메라 권한 상태 조회 없음, 온보딩 가이드 연결 보류, appVersion 쿼리)에 맞게 이식한다.
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("S6 · 설정", () => {
  it("2개 그룹 6개 행을 확정 문구 그대로 보여준다", () => {
    renderAt("/settings");

    expect(screen.getByText("설정")).toBeInTheDocument();

    expect(screen.getByText("측정")).toBeInTheDocument();
    expect(screen.getByText("카메라 권한")).toBeInTheDocument();
    expect(screen.getByText("측정 기준 안내")).toBeInTheDocument();
    expect(screen.getByText("권한은 시스템 설정에서 바꿀 수 있어요")).toBeInTheDocument();

    expect(screen.getByText("지원")).toBeInTheDocument();
    expect(screen.getByText("문의하기")).toBeInTheDocument();

    expect(screen.getByText("약관 · 정보")).toBeInTheDocument();
    expect(screen.getByText("이용약관")).toBeInTheDocument();
    expect(screen.getByText("개인정보처리방침")).toBeInTheDocument();
  });

  it("측정 기준 안내는 표시만 하고 버튼으로 노출되지 않는다 (온보딩 웹 이관 전까지 연결 보류)", () => {
    renderAt("/settings");

    expect(screen.queryByRole("button", { name: "측정 기준 안내" })).not.toBeInTheDocument();
    expect(screen.getByText("측정 기준 안내")).toBeInTheDocument();
  });

  it("문의하기 행은 /contact 로 이동한다", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "문의하기" }));

    expect(screen.getByTitle("문의하기")).toBeInTheDocument();
  });

  it("이용약관 행은 /terms 로 이동한다", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "이용약관" }));

    expect(screen.getByRole("heading", { name: TERMS_OF_SERVICE.title })).toBeInTheDocument();
  });

  it("개인정보처리방침 행은 /privacy 로 이동한다", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "개인정보처리방침" }));

    expect(screen.getByRole("heading", { name: PRIVACY_POLICY.title })).toBeInTheDocument();
  });

  it("appVersion 쿼리를 버전 정보 행에 반영한다", () => {
    renderAt("/settings?appVersion=1.4.2");

    expect(screen.getByText("1.4.2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "버전 정보" })).not.toBeInTheDocument();
  });

  it("appVersion 쿼리가 없으면 알 수 없음으로 표시한다", () => {
    renderAt("/settings");

    expect(screen.getByText("알 수 없음")).toBeInTheDocument();
  });

  it("카메라 권한 행은 클릭 시 open-settings 메시지를 네이티브로 보낸다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));

    renderAt("/settings");
    fireEvent.click(screen.getByRole("button", { name: "카메라 권한, 시스템 설정 열기" }));

    expect(postMessage).toHaveBeenCalledWith('{"type":"open-settings","atMs":1000}');
  });

  it("브라우저 단독 모드(브리지 없음)에서 카메라 권한 행을 눌러도 죽지 않는다", () => {
    renderAt("/settings");

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "카메라 권한, 시스템 설정 열기" }));
    }).not.toThrow();
  });
});
