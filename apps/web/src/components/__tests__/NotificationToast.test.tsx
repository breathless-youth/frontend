import { fireEvent, render, screen } from "@testing-library/react";
import * as Sentry from "@sentry/react";
import { afterEach, describe, expect, it } from "vitest";

import { NotificationToast } from "../NotificationToast";

/**
 * 앱을 쓰는 중에 온 그룹 알림 토스트
 *
 * 서버가 보낸 제목과 본문에는 다른 사람의 닉네임과 그룹 이름이 들어 있어 클릭 분석과 오류 기록에 남지 않아야 한다.
 */

const TITLE = "새 신청을 확인해 볼까요?";
const BODY = "민준님이 새벽 공시반에 신청했어요";
const NAMES = /민준|새벽 공시반|확인해 볼까요/;

function renderToast(title = TITLE, body = BODY) {
  render(<NotificationToast title={title} body={body} onOpen={() => {}} />);
  return screen.getByRole("button");
}

afterEach(async () => {
  const client = Sentry.getClient();
  Sentry.getCurrentScope().setClient(undefined);
  await client?.close();
});

describe("NotificationToast", () => {
  it("분석 도구가 문구를 가리는 표시를 버튼에 단다", () => {
    const button = renderToast();

    expect(button).toHaveAttribute("data-amp-mask");
    expect(button).toHaveAttribute("data-amp-mask-attributes", "aria-label");
    expect(button).toHaveAttribute("data-sentry-element", "NotificationToast");
  });

  it("물음표로 끝나는 제목 뒤에는 마침표를 더하지 않는다", () => {
    expect(renderToast()).toHaveAccessibleName(`${TITLE} ${BODY}`);
  });

  it("문장 부호 없이 끝나는 제목 뒤에는 마침표를 넣어 본문과 끊어 읽게 한다", () => {
    expect(
      renderToast("그룹장이 됐어요", "새벽 공시반의 그룹장을 넘겨받았어요"),
    ).toHaveAccessibleName("그룹장이 됐어요. 새벽 공시반의 그룹장을 넘겨받았어요");
  });

  it("Sentry 클릭 기록에는 컴포넌트 이름만 남고 제목과 본문은 남지 않는다", () => {
    const breadcrumbs: Sentry.Breadcrumb[] = [];
    // 운영과 같은 클릭 기록 통합을 그대로 쓰고, 클릭 기록과 무관한 계측만 끈다.
    const client = new Sentry.BrowserClient({
      dsn: "https://key@o0.ingest.example.test/123",
      integrations: [
        Sentry.breadcrumbsIntegration({
          console: false,
          fetch: false,
          history: false,
          sentry: false,
          xhr: false,
        }),
      ],
      beforeBreadcrumb: (breadcrumb) => {
        breadcrumbs.push(breadcrumb);
        return breadcrumb;
      },
      stackParser: Sentry.defaultStackParser,
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
    });
    Sentry.getCurrentScope().setClient(client);
    client.init();

    const button = renderToast();
    fireEvent.click(button);
    // 실제로 누르는 곳은 버튼 안의 제목이나 본문 글자일 때가 많다.
    fireEvent.click(screen.getByText(BODY));

    const clicks = breadcrumbs.filter((breadcrumb) => breadcrumb.category === "ui.click");
    expect(clicks).toHaveLength(2);
    for (const click of clicks) {
      expect(click.message).toContain("NotificationToast");
      expect(click.message).not.toMatch(NAMES);
    }
  });
});
