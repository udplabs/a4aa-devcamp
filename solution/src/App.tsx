import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Chat } from "./components/Chat";
import { LoginScreen } from "./components/LoginScreen";
import { LabGuide } from "./components/LabGuide";

export default function App() {
  const { isAuthenticated, isLoading, user, logout } = useAuth0();
  const [showGuide, setShowGuide] = useState(false);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voyager</h1>
        <div className="user-info">
          <button className="guide-toggle" onClick={() => setShowGuide(true)}>
            Lab Guide
          </button>
          <span>{user?.name}</span>
          <button
            className="logout-button"
            onClick={() =>
              logout({ logoutParams: { returnTo: window.location.origin } })
            }
          >
            Log Out
          </button>
        </div>
      </header>
      <Chat />
      {showGuide && <LabGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}
