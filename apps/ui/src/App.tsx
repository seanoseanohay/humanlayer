import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SessionList } from "./pages/SessionList";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <a href="/">HumanLayer Agent</a>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<SessionList />} />
            <Route
              path="/sessions/:id"
              element={<div>Session Detail (coming next)</div>}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
