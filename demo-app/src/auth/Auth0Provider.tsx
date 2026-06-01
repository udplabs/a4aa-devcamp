import { Auth0Provider as Provider } from "@auth0/auth0-react";
import { PropsWithChildren } from "react";
import { useRuntimeConfig } from "../config/runtimeConfig";

export function Auth0Provider({ children }: PropsWithChildren) {
  const { domain, clientId, audience } = useRuntimeConfig();

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
