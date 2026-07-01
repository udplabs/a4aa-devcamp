// =============================================================
// LAB 01: Make the login button functional
// See: lab-guide/01-user-authentication.md
//
// The login screen UI is pre-built. You need to:
// - Import useAuth0 from @auth0/auth0-react
// - Call loginWithRedirect() when the button is clicked
// =============================================================

export function LoginScreen() {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>RetailZero Z-Merchant</h1>
        <p>Sign in to draft wholesale quotes and route deals to the desk.</p>
        <p className="login-subtitle">
          Sales rep access is secured by Auth0.
        </p>
        <button className="login-button" disabled>
          Log In (Not Implemented Yet)
        </button>
      </div>
    </div>
  );
}
