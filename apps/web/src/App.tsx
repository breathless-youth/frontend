import { Route, Routes } from "react-router-dom";

import { HomePage } from "@/routes/HomePage";
import { ResultPage } from "@/routes/ResultPage";
import { RoomPage } from "@/routes/RoomPage";

/**
 * S3-1~S3-8(세션)은 8개의 라우트가 아니라 `/room/:id` **하나**가 갖는 프레젠테이션 상태다
 * (종료 확인은 모달, 자동 종료 안내는 같은 라우트의 상태).
 * **S4(공부 결과)만 별도 라우트**이며 `/room/:id` 형제 경로로 둔다 — 세션이 끝난 뒤의 화면이라
 * 룸 컨텍스트에 속하고, 뒤로 가기로 살아 있는 세션에 되돌아가지 않는다(`replace` 이동).
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:id" element={<RoomPage />} />
      <Route path="/room/:id/result" element={<ResultPage />} />
    </Routes>
  );
}
