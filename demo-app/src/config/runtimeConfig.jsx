import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

// Runtime config served by the backend per tenant. Fetched once on
// mount so a single SPA build serves every demo subdomain, instead of
// baking VITE_AUTH0_* at Vite build time.
const RuntimeConfigContext = createContext(null);

export function useRuntimeConfig() {
  const cfg = useContext(RuntimeConfigContext);
  if (!cfg) {
    throw new Error("useRuntimeConfig must be used within RuntimeConfigProvider");
  }
  return cfg;
}

export function RuntimeConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
        return res.json();
      })
      .then((cfg) => {
        if (!cfg.domain || !cfg.clientId) {
          throw new Error("Auth0 domain and clientId are required.");
        }
        setConfig(cfg);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="loading-screen">
        <p>Configuration error: {error}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <RuntimeConfigContext.Provider value={config}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}
