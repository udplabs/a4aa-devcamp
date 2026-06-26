import { useState, useCallback } from "react";

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

export function useLabProgress() {
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

  return { getModuleStatus, setModuleStatus, resetProgress, progress };
}
