import { useAuth0 } from "@auth0/auth0-react";

export function LoginScreen() {
  const { loginWithRedirect, isLoading } = useAuth0();

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Nexus</h1>
        <p>Your company knowledge, secured by identity.</p>
        <p className="login-subtitle">
          Authentication is handled by Auth0, with actions enforced through FGA for authorization, Token Vault for credential management, CIBA for out-of-band approval, and an Auth0-secured MCP server for AI agent orchestration.
        </p>
        <button
          className="login-button"
          onClick={() => loginWithRedirect()}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Log In"}
        </button>
        <p className="login-disclaimer">
          Fictitious application for the Auth0 dev&#123;camp&#125; Agentic AI workshop only.
        </p>
      </div>
    </div>
  );
}
