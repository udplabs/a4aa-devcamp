import { useAuth0 } from "@auth0/auth0-react";

export function LoginScreen() {
  const { loginWithRedirect, isLoading } = useAuth0();

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>RetailZero Z-Merchant</h1>
        <p>Sign in to run wholesale quotes at deal-desk speed.</p>
        <p className="login-subtitle">
          Authenticated by Auth0. Actions are gated by FGA, Token Vault,
          CIBA, and an Auth0-secured MCP server.
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
