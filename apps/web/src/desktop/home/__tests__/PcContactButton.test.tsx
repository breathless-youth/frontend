import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PcContactButton } from "../PcContactButton";

it("받은 상담 주소를 새 탭으로 여는 링크이고 새 탭임을 읽어 준다", () => {
  render(<PcContactButton href="/contact/chat?appVersion=1" />);

  const link = screen.getByRole("link", { name: "문의 새 탭에서 열려요" });
  expect(link).toHaveAttribute("href", "/contact/chat?appVersion=1");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener");
});
