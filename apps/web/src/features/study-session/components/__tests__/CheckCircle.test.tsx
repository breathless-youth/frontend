import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CheckCircle } from "../CheckCircle";

describe("CheckCircle", () => {
  it("장식 아이콘이라 aria-hidden 이다", () => {
    const { container } = render(<CheckCircle />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
