import { useState } from "react";
import { Chat } from "./components/Chat";
import { LabGuide } from "./components/LabGuide";

// =============================================================
// LAB 1: Add authentication gate
// See: lab-guide/01-user-authentication.md - Step 7
//
// Currently the chat is shown to everyone. After Lab 1, only
// authenticated users should see the chat.
// =============================================================

export default function App() {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voyager</h1>
        <div className="user-info">
          <button className="guide-toggle" onClick={() => setShowGuide(true)}>
            Lab Guide
          </button>
          <span>Not logged in</span>
          {/* LAB 1: Add logout button here */}
        </div>
      </header>
      <Chat />
      {showGuide && <LabGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}
