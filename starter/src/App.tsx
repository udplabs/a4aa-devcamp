import { Chat } from "./components/Chat";

// =============================================================
// LAB 1: Add authentication gate
// See: lab-guide/01-user-authentication.md - Step 7
//
// Currently the chat is shown to everyone. After Lab 1, only
// authenticated users should see the chat.
// =============================================================

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Voyager</h1>
        <div className="user-info">
          <span>Not logged in</span>
          {/* LAB 1: Add logout button here */}
        </div>
      </header>
      <Chat />
    </div>
  );
}
