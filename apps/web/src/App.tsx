import { Route, Routes } from "react-router-dom";

import { HomePage } from "@/routes/HomePage";
import { RoomPage } from "@/routes/RoomPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:id" element={<RoomPage />} />
    </Routes>
  );
}
