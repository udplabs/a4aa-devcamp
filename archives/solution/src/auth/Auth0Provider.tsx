import { Auth0Provider as Provider } from "@auth0/auth0-react";
import { PropsWithChildren } from "react";

export function Auth0Provider({ children }: PropsWithChildren) {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  if (!domain || !clientId) {
    throw new Error(
      "Auth0 domain and clientId are required. Check your .env file."
    );
  }

  return (
    <Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience,
        scope: "openid profile email",
      }}
    >
      {children}
    </Provider>
  );
}
