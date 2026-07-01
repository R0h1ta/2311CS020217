import { useState, useCallback } from 'react';

const STORAGE_KEY = 'read_notification_ids';

function loadReadIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function useReadStatus() {
  const [readIds, setReadIds] = useState(loadReadIds);

  const markRead = useCallback((id) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isRead = useCallback((id) => readIds.has(id), [readIds]);

  return { isRead, markRead };
}