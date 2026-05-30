import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { PriorityInboxPage } from "./pages/PriorityInboxPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/priority" element={<PriorityInboxPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
