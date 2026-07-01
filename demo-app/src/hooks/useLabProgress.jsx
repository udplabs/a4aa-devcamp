import { createContext, useContext, useState, useCallback } from "react";

const STORAGE_KEY = "nexus-lab-progress";

// Status values: "idle" | "pass" | "fail"
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProgress(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

const LabProgressContext = createContext(null);

// Shared across the whole render tree (App + ProgressTracker + LabGuide are
// separate sibling subtrees -- see main.jsx) so a check passing in one place
// is visible everywhere else immediately, without a page reload.
export function LabProgressProvider({ children }) {
  const [progress, setProgress] = useState(loadProgress);

  const setModuleStatus = useCallback((moduleId, status) => {
    setProgress((prev) => {
      const next = { ...prev, [moduleId]: status };
      saveProgress(next);
      return next;
    });
  }, []);

  const getModuleStatus = useCallback((moduleId) => {
    return progress[moduleId] || "idle";
  }, [progress]);

  const resetProgress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProgress({});
  }, []);

  return (
    <LabProgressContext.Provider value={{ getModuleStatus, setModuleStatus, resetProgress, progress }}>
      {children}
    </LabProgressContext.Provider>
  );
}

export function useLabProgress() {
  const ctx = useContext(LabProgressContext);
  if (!ctx) {
    throw new Error("useLabProgress must be used within LabProgressProvider");
  }
  return ctx;
}
