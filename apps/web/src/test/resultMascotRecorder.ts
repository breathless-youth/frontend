import { onTestFinished } from "vitest";

export type MascotSnapshot = { faces: string[]; accessories: string[] };

const MASCOT = "[data-result-mascot]";

function sources(root: Element, selector: string): string[] {
  return Array.from(root.querySelectorAll(selector), (img) => img.getAttribute("src") ?? "");
}

function snapshot(mascot: Element): MascotSnapshot {
  return {
    faces: sources(mascot, "[data-slot='mascot-body'] img"),
    accessories: sources(mascot, "img[data-slot^='accessory-']"),
  };
}

/**
 * 결과 화면 마스코트에 들어간 그림 기록
 *
 * DOM 변경을 지켜보며 결과 화면 마스코트 자리에 한 번이라도 들어간 그림 주소를 모은다.
 * 그림 주소가 바뀌면 바뀌기 전 주소도 남겨서, 잠깐 그렸다가 바꾼 그림도 놓치지 않는다.
 * 마스코트가 처음 나타난 순간의 표정 그림과 소품 그림은 따로 남긴다.
 * 부른 테스트가 끝나면 지켜보기를 멈춘다.
 */
export function recordResultMascot() {
  const seen = new Set<string>();
  let first: MascotSnapshot | null = null;
  const inMascot = (node: Node) => node instanceof Element && node.closest(MASCOT) !== null;
  const remember = (value: string | null) => {
    if (value) seen.add(value);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        if (inMascot(record.target)) {
          remember(record.oldValue);
          remember((record.target as Element).getAttribute("src"));
        }
        continue;
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const images = node.matches("img") ? [node] : Array.from(node.querySelectorAll("img"));
        for (const image of images) {
          if (inMascot(image)) remember(image.getAttribute("src"));
        }
      }
    }
    const mascot = document.querySelector(MASCOT);
    if (first === null && mascot !== null) {
      first = snapshot(mascot);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src"],
    attributeOldValue: true,
  });
  onTestFinished(() => observer.disconnect());
  return { first: () => first, everSeen: () => [...seen] };
}
