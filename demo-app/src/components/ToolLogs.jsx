import { useState, useEffect, useRef } from "react";

const STATUS_COLOR = { success: "#34D399", error: "#F87171" };
const STATUS_ICON  = { success: "✓", error: "✗" };

function ago(ts) {
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export function ToolLogs() {
  const [logs, setLogs]           = useState([]);
  const [expanded, setExpanded]   = useState({});
  const [paused, setPaused]       = useState(false);
  const pausedRef                 = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const refresh = () => {
      if (pausedRef.current) return;
      fetch("/api/mcp/logs")
        .then((r) => r.json())
        .then((data) => setLogs(data.logs || []))
        .catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  const toggleExpand = (i) =>
    setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="panel-container">
      <div className="panel-header">
        <span className="panel-title">Tool Call Log</span>
        <div className="log-controls">
          {logs.length > 0 && (
            <span className="log-count">{logs.length} entries</span>
          )}
          <button
            className={`log-pause-btn ${paused ? "paused" : ""}`}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="logs-empty">
          <p>No tool calls recorded yet.</p>
          <p className="logs-empty-hint">
            Start a chat conversation to see tool invocations appear here in real time.
          </p>
        </div>
      ) : (
        <div className="log-entries">
          {logs.map((entry, i) => (
            <div key={i} className={`log-entry log-entry--${entry.status}`}>
              <div
                className="log-entry-header"
                onClick={() => toggleExpand(i)}
                role="button"
              >
                <span
                  className="log-status-icon"
                  style={{ color: STATUS_COLOR[entry.status] }}
                >
                  {STATUS_ICON[entry.status] || "·"}
                </span>
                <span className="log-tool-name">{entry.tool}</span>
                <span className="log-user-sub" title={entry.userSub}>
                  {entry.userSub ? entry.userSub.replace(/^auth0\|/, "").slice(0, 12) + "…" : "—"}
                </span>
                <span className="log-time">{ago(entry.timestamp)}</span>
                <span className="log-chevron">{expanded[i] ? "▲" : "▼"}</span>
              </div>

              {expanded[i] && (
                <div className="log-entry-detail">
                  <div className="log-detail-block">
                    <span className="log-detail-label">Args</span>
                    <pre className="log-json">{JSON.stringify(entry.args, null, 2)}</pre>
                  </div>
                  <div className="log-detail-block">
                    <span className="log-detail-label">Result</span>
                    <pre className="log-json">{JSON.stringify(entry.result, null, 2)}</pre>
                  </div>
                  <div className="log-detail-block">
                    <span className="log-detail-label">Timestamp</span>
                    <span className="log-detail-value">{new Date(entry.timestamp).toISOString()}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
