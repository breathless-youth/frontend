import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DoneAddressLine } from "../PremiumFakeDoorFlow";

describe("DoneAddressLine", () => {
  it("이메일이 있으면 앱과 이메일로 보낸다고 쓴다", () => {
    const { container } = render(<DoneAddressLine email="minjun@example.com" />);
    expect(container).toHaveTextContent("알림은 앱과 minjun@example.com로 보내드려요.");
  });

  it("이메일이 없으면 빈 주소 문장을 그리지 않는다", () => {
    const { container } = render(<DoneAddressLine email={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
