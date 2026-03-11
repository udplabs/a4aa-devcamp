import { useAuth0 } from "@auth0/auth0-react";

export function LoginScreen() {
  const { loginWithRedirect, isLoading } = useAuth0();

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Voyager</h1>
        <p>Sign in to plan your next adventure.</p>
        <p className="login-subtitle">
          Your travel plans are secured by Auth0.
        </p>
        <button
          className="login-button"
          onClick={() => loginWithRedirect()}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Log In"}
        </button>
      </div>
    </div>
  );
}
