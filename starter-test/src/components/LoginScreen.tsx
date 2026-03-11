// =============================================================
// LAB 1: Implement LoginScreen
// See: lab-guide/01-environment-setup.md - Step 6
//
// This component should:
// - Show an app title and description
// - Have a "Log In" button that calls loginWithRedirect()
// - Use the useAuth0() hook from @auth0/auth0-react
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
          <strong style={{ color: "#FF6B35" }}>Lab 1, Step 6:</strong>{" "}
          Use <code style={{ background: "#2a2a3a", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>useAuth0()</code> and{" "}
          <code style={{ background: "#2a2a3a", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>loginWithRedirect()</code>{" "}
          to make this button work.
        </p>
      </div>
    </div>
  );
}
