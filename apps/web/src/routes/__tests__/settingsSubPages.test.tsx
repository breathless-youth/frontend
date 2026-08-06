import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { CONTACT_FORM_URL } from "@/features/settings/settingsInfo";
import { canExitViaHistoryBack, hardReplace } from "@/lib/hardNavigation";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/features/settings/legalDocuments";
import { OPEN_SOURCE_ENTRIES } from "@/features/settings/openSourceLicenses";

// jsdom은 실제 내비게이션을 구현하지 않는다 — 하드 내비게이션은 모듈 단위로 모킹한다
// (`lib/hardNavigation.ts` 주석, `settingsPage.test.tsx`와 같은 패턴). 판정 순수 함수는
// 실제 구현을 그대로 쓴다.
vi.mock("@/lib/hardNavigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hardNavigate: vi.fn(),
  hardReplace: vi.fn(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  // 개별 테스트가 인스턴스에 씌운 referrer·history.length 셰도잉을 걷는다.
  Reflect.deleteProperty(document, "referrer");
  Reflect.deleteProperty(window.history, "length");
});

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
    // 항목은 섹션·카드·강조 없이 한 문단으로 잇는다(2026-08-02 확정) — 이름 존재만 확인한다.
    for (const entry of OPEN_SOURCE_ENTRIES) {
      expect(document.body.textContent).toContain(entry.name);
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

/**
 * /contact 는 문서 단위 라우트라(COEP 예외 — `ContactPage` 머리 주석) 뒤로 가기가
 * SPA 스택이 아니라 **문서 히스토리**로 되돌아간다. idx 검사(위 /terms 시나리오)는
 * 하드 내비게이션 직후 항상 0이라 여기서는 판정 기준이 될 수 없다.
 */
describe("/contact 문서 단위 뒤로 가기", () => {
  describe("canExitViaHistoryBack (판정 순수 함수)", () => {
    it("같은 오리진에서 넘어왔고 뒤로 갈 항목이 있으면 true", () => {
      expect(
        canExitViaHistoryBack("https://app.test/settings?userId=7", "https://app.test", 2),
      ).toBe(true);
    });

    it("referrer가 비었거나 다른 사이트면 false — back()이 앱 밖으로 나간다", () => {
      expect(canExitViaHistoryBack("", "https://app.test", 2)).toBe(false);
      expect(canExitViaHistoryBack("https://evil.test/x", "https://app.test", 2)).toBe(false);
      // 접두 오리진 위장도 걸러진다 — `${origin}/` 비교를 쓰는 이유.
      expect(canExitViaHistoryBack("https://app.test.evil.com/x", "https://app.test", 2)).toBe(
        false,
      );
    });

    it("히스토리가 1이면(새 탭 직행) false", () => {
      expect(canExitViaHistoryBack("https://app.test/settings", "https://app.test", 1)).toBe(false);
    });
  });

  it("설정에서 넘어온 경우 history.back()으로 이전 문서(COEP 걸린 설정)를 복원한다", () => {
    Object.defineProperty(document, "referrer", {
      value: `${window.location.origin}/settings?userId=7`,
      configurable: true,
    });
    Object.defineProperty(window.history, "length", { value: 2, configurable: true });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});

    renderAt("/contact?userId=7");
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(hardReplace).not.toHaveBeenCalled();
  });

  it("딥링크로 곧장 열렸으면 설정을 **하드 내비게이션**으로 연다(쿼리 승계) — SPA로 가면 이 문서의 'COEP 없음'이 설정 이후까지 승계된다", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});

    renderAt("/contact?userId=7&appVersion=1.4.2");
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(hardReplace).toHaveBeenCalledWith("/settings?userId=7&appVersion=1.4.2");
    expect(back).not.toHaveBeenCalled();
  });
});
