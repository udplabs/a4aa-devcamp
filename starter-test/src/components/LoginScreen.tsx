// =============================================================
// LAB 1: Make the login button functional
// See: lab-guide/01-user-authentication.md - Step 7
//
// The login screen UI is pre-built. You need to:
// - Import useAuth0 from @auth0/auth0-react
// - Call loginWithRedirect() when the button is clicked
// =============================================================

export function LoginScreen() {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Voyager</h1>
        <p>Sign in to plan your next adventure.</p>
        <p className="login-subtitle">
          Your travel plans are secured by Auth0.
        </p>
        <button className="login-button" disabled>
          Log In (Not Implemented Yet)
        </button>
        <p className="login-subtitle" style={{ marginTop: 24 }}>
          <strong style={{ color: "#FF6B35" }}>Lab 1, Step 7:</strong>{" "}
          Use <code style={{ background: "#2a2a3a", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>useAuth0()</code> and{" "}
          <code style={{ background: "#2a2a3a", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>loginWithRedirect()</code>{" "}
          to make this button work.
        </p>
      </div>
    </div>
  );
}
