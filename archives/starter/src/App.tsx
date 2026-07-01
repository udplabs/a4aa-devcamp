import { useState } from "react";
import { Chat } from "./components/Chat";
import { LabGuide } from "./components/LabGuide";

// =============================================================
// LAB 01: Add the Auth0 authentication gate
// See: lab-guide/01-user-authentication.md
//
// Currently the chat is shown to everyone. After Lab 01, only
// authenticated RetailZero reps see Z-Merchant.
// =============================================================

export default function App() {
  const [showGuide, setShowGuide] = useState(false);
  const [guideMinimized, setGuideMinimized] = useState(false);

  const appClass = [
    "app",
    showGuide && "is-guide-open",
    showGuide && guideMinimized && "is-guide-minimized",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={appClass}>
      <header className="app-header">
        <h1>RetailZero Z-Merchant</h1>
        <div className="user-info">
          <button
            className={`guide-toggle${showGuide ? " is-open" : ""}`}
            onClick={() => setShowGuide((v) => !v)}
            aria-pressed={showGuide}
          >
            {showGuide ? "Hide Lab Guide" : "Lab Guide"}
          </button>
          <span>Not logged in</span>
          {/* LAB 01: Render user email + logout button once authenticated. */}
        </div>
      </header>
      <main className="workspace">
        {showGuide && (
          <aside
            className={`guide-surface${guideMinimized ? " is-minimized" : ""}`}
          >
            <LabGuide
              minimized={guideMinimized}
              onToggleMinimize={() => setGuideMinimized((v) => !v)}
              onClose={() => {
                setShowGuide(false);
                setGuideMinimized(false);
              }}
            />
          </aside>
        )}
        <section className="chat-surface">
          <Chat />
        </section>
      </main>
    </div>
  );
}
