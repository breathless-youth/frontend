import { createContext } from "react";

/** 중첩 시트를 바깥 모달의 터치·포커스 허용 영역 안에 그린다. */
export const OverlayPortalContainerContext = createContext<HTMLElement | null>(null);
