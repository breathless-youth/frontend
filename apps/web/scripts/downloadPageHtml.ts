/**
 * 타임랩스 공유 링크(`/download`)용 HTML
 *
 * 웹은 모든 경로가 같은 `index.html`을 받아서 링크 미리보기가 하나뿐이다.
 * 빌드된 `index.html`에서 OG 태그만 바꾼 `download.html`을 따로 내고,
 * CloudFront 함수가 `/download`를 이 파일로 보낸다(`infra/web/cloudfront/spa-fallback.js`).
 */
const DOWNLOAD_OG: Record<string, string> = {
  "og:url": "https://web.focusmakers.app/download",
  "og:description": "오늘 공부한 모습, 타임랩스로 남겨요. 공부하고 타임랩스를 만들어 보세요",
  "og:image": "https://web.focusmakers.app/og-timelapse.png?v=2",
  "og:image:alt": "포커스 메이커스 공부 타임랩스",
};

export function toDownloadPageHtml(indexHtml: string): string {
  let html = indexHtml;
  for (const [property, content] of Object.entries(DOWNLOAD_OG)) {
    const tag = new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]*"\\s*/>`);
    // 태그 모양이 바뀌어 못 찾으면 초대 미리보기가 그대로 나가므로 빌드를 멈춘다.
    if (!tag.test(html)) {
      throw new Error(`index.html에서 ${property} 태그를 찾지 못했습니다`);
    }
    html = html.replace(tag, `<meta property="${property}" content="${content}" />`);
  }
  return html;
}
