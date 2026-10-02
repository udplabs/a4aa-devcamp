import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRuntimeConfig } from "../config/runtimeConfig";

const PARAM_PLACEHOLDER = {
  query:          "e.g. Q3 roadmap",
  documentId:     "e.g. q3-roadmap",
  documentTitle:  "e.g. Q3 Product Roadmap",
  recipientEmail: "e.g. vendor@acme.com",
  title:          "e.g. Security Policy Summary",
  body:           "e.g. Key points from the InfoSec policy...",
};

export function ToolTester() {
  const { getAccessTokenSilently } = useAuth0();
  const { audience, acmePort, acmeUrl } = useRuntimeConfig();

  // Acme runs as its own Express process on a separate port, so the SPA can't
  // reach it through the same-origin /api/... proxy used for the Nexus app.
  // The backend reports Acme's public origin (the Codespace forwarded URL,
  // or localhost when running locally).
  const ACME_SERVER_URL =
    acmeUrl || `${window.location.protocol}//${window.location.hostname}:${acmePort}`;

  const [tools, setTools]       = useState([]);
  const [selected, setSelected] = useState("");
  const [params, setParams]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  // "nexus" = first-party agent (docagent-mcp-obo). It exchanges the user's
  // token via RFC 8693 On-Behalf-Of, so its token carries a nested act claim:
  // act.sub = the Nexus agent, act.act.sub = the SPA the request started in.
  // "acme" = a genuine third-party agent with its own standalone server. It
  // signs the user in directly (Authorization Code + PKCE, client_id = its
  // CIMD URL), so its token carries a single-level act.sub = Acme's agent
  // and only the scopes the admin granted. Compare the two in Tool Logs.
  const [agent, setAgent] = useState("nexus");
  const [acmeConnected, setAcmeConnected] = useState(null);

  useEffect(() => {
    fetch("/api/mcp/status")
      .then((r) => r.json())
      .then((data) => {
        setTools(data.tools || []);
        if (data.tools?.length) setSelected(data.tools[0].name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (agent !== "acme") return;
    fetch(`${ACME_SERVER_URL}/status`)
      .then((r) => r.json())
      .then((data) => setAcmeConnected(!!data.connected))
      .catch(() => setAcmeConnected(false));
  }, [agent]);

  const currentTool = tools.find((t) => t.name === selected);
  const paramKeys   = currentTool
    ? Object.keys(currentTool.inputSchema?.properties || {})
    : [];

  const handleToolChange = (name) => {
    setSelected(name);
    setParams({});
    setResult(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience, scope: "chat:send" },
      });

      const res = await fetch("/api/mcp/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ toolName: selected, parameters: params, agent }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setResult(data.result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-container tester-layout">
      <div className="tester-form-col">
        <div className="panel-header">
          <span className="panel-title">Tool Tester</span>
          <span className="tester-hint">Direct tool call — same OBO + FGA path as chat</span>
        </div>

        <form className="tester-form" onSubmit={handleSubmit}>
          <div className="tester-field">
            <label className="tester-label">Call as</label>
            <select
              className="tester-select"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              <option value="nexus">Nexus Agent (first-party)</option>
              <option value="acme">Acme Partner Agent (third-party)</option>
            </select>
            <span className="tester-field-hint">
              Both call the same Nexus MCP Server for the same employee, with different agent identities: Nexus's OBO token carries a nested act claim (agent, then the SPA), while Acme's token from its own consent flow carries a single-level act claim and Acme's CIMD URL as client_id. Acme only holds the read scopes its admin granted, so share_document returns 403 insufficient_scope. Expand a Tool Logs entry to compare.
            </span>
            {agent === "acme" && acmeConnected === false && (
              <span className="tester-field-hint">
                Acme hasn't completed its login yet.{" "}
                <a
                  className="tester-connect-link"
                  href={`${ACME_SERVER_URL}/login`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Connect Acme
                </a>{" "}
                to run tool calls as the third-party agent.
              </span>
            )}
          </div>

          <div className="tester-field">
            <label className="tester-label">Tool</label>
            <select
              className="tester-select"
              value={selected}
              onChange={(e) => handleToolChange(e.target.value)}
            >
              {tools.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {currentTool && (
            <p className="tester-tool-desc">{currentTool.description}</p>
          )}

          {paramKeys.map((key) => {
            const schema = currentTool.inputSchema.properties[key];
            const required = (currentTool.inputSchema.required || []).includes(key);
            return (
              <div key={key} className="tester-field">
                <label className="tester-label">
                  {key}
                  {required && <span className="tester-required">*</span>}
                </label>
                <input
                  className="tester-input"
                  type="text"
                  placeholder={PARAM_PLACEHOLDER[key] || schema?.description || ""}
                  value={params[key] || ""}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
                {schema?.description && (
                  <span className="tester-field-hint">{schema.description}</span>
                )}
              </div>
            );
          })}

          <button
            type="submit"
            className="tester-submit"
            disabled={loading || !selected}
          >
            {loading ? "Calling..." : "Call Tool"}
          </button>
        </form>
      </div>

      <div className="tester-result-col">
        <div className="panel-header">
          <span className="panel-title">Result</span>
          {result !== null && (
            <button
              className="tester-clear-btn"
              onClick={() => setResult(null)}
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <div className="tester-result-error">
            <span className="tester-result-icon">✗</span>
            <pre className="log-json">{error}</pre>
            {/not connected|connect acme/i.test(error) && (
              <span className="tester-field-hint">
                <a
                  className="tester-connect-link"
                  href={`${ACME_SERVER_URL}/login`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Connect Acme
                </a>{" "}
                to grant it access, then try the call again.
              </span>
            )}
          </div>
        )}

        {result !== null && !error && (
          <div className="tester-result-success">
            <span className="tester-result-icon tester-result-icon--ok">✓</span>
            <pre className="log-json">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        {result === null && !error && (
          <div className="logs-empty">
            <p>No result yet.</p>
            <p className="logs-empty-hint">Fill in the parameters and click "Call Tool".</p>
          </div>
        )}
      </div>
    </div>
  );
}
