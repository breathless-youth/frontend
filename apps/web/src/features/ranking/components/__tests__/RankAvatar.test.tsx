import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RankAvatar } from "../RankAvatar";

describe("RankAvatar", () => {
  it("닉네임 첫 글자를 쓰고 화면 낭독기에서는 숨긴다", () => {
    const { container } = render(<RankAvatar nickname="커피세잔" />);

    expect(container.textContent).toBe("커");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("이모지처럼 두 단위로 된 글자도 한 글자로 자른다", () => {
    const { container } = render(<RankAvatar nickname="🔥불꽃" />);

    expect(container.textContent).toBe("🔥");
  });

  it("국기처럼 여러 코드포인트로 된 글자도 통째로 쓴다", () => {
    const { container } = render(<RankAvatar nickname="🇰🇷화이팅" />);

    expect(container.textContent).toBe("🇰🇷");
  });

  it("나는 나를 쓴다", () => {
    const { container } = render(<RankAvatar nickname="오늘도출석" me />);

    expect(container.textContent).toBe("나");
  });

  it("내 글자를 첫 글자로 고르면 나도 닉네임 첫 글자를 쓴다", () => {
    const { container } = render(<RankAvatar nickname="오늘도출석" me meLetter="initial" />);

    expect(container.textContent).toBe("오");
  });
});
