import { useState, useEffect } from "react";

const SCOPE_BADGE_COLOR = {
  "mcp:docs:search": "#34D399",
  "mcp:docs:read":   "#60A5FA",
  "mcp:crm:log":     "#FBBF24",
  "mcp:docs:share":  "#F87171",
};

const SECURITY_LAYERS = {
  search_documents:  ["OBO Token Exchange", "FGA"],
  get_document:      ["OBO Token Exchange", "FGA"],
  log_crm_activity:  ["OBO Token Exchange", "Token Vault"],
  share_document:    ["OBO Token Exchange", "FGA", "CIBA"],
};

export function MCPStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/mcp/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="panel-container">
        <div className="panel-error">Failed to load MCP status: {error}</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="panel-container">
        <div className="panel-loading">
          <div className="spinner" />
          <span>Loading MCP server status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-container">
      <div className="panel-header">
        <div className="status-row">
          <span className="status-dot online" />
          <span className="status-label">MCP Server</span>
          <span className="status-url">{status.serverUrl}</span>
        </div>
        <span className="status-time">Last checked {new Date(status.timestamp).toLocaleTimeString()}</span>
      </div>

      <section className="panel-section">
        <h3 className="section-title">Scope Inventory</h3>
        <div className="scope-list">
          {status.scopes.map((scope) => (
            <span
              key={scope}
              className="scope-pill"
              style={{ borderColor: SCOPE_BADGE_COLOR[scope] || "#9921FE", color: SCOPE_BADGE_COLOR[scope] || "#9921FE" }}
            >
              {scope}
            </span>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h3 className="section-title">Tools ({status.tools.length})</h3>
        <div className="tool-cards">
          {status.tools.map((tool) => (
            <div key={tool.name} className="tool-card">
              <div className="tool-card-header">
                <span className="tool-card-name">{tool.name}</span>
                <span
                  className="tool-scope-pill"
                  style={{ borderColor: SCOPE_BADGE_COLOR[tool.requiredScope] || "#9921FE", color: SCOPE_BADGE_COLOR[tool.requiredScope] || "#9921FE" }}
                >
                  {tool.requiredScope}
                </span>
              </div>
              <p className="tool-card-desc">{tool.description}</p>
              <div className="tool-security-badges">
                {(SECURITY_LAYERS[tool.name] || ["OBO Token Exchange"]).map((layer) => (
                  <span key={layer} className="security-badge">{layer}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
