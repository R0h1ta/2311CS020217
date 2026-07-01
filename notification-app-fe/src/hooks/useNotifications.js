import { useState, useEffect, useCallback } from 'react';
import { fetchNotifications } from '../api/notifications';
import { Log } from '../../../logging-middleware/logger';

export function useNotifications({ limit, page, notification_type } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Log('frontend', 'info', 'hook', 'Fetching notifications');
      const data = await fetchNotifications({ limit, page, notification_type });
      setNotifications(data);
      await Log('frontend', 'info', 'hook', `Fetched ${data.length} notifications`);
    } catch (err) {
      setError(err.message);
      await Log('frontend', 'error', 'hook', `Failed to fetch notifications: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [limit, page, notification_type]);

  useEffect(() => {
    load();
  }, [load]);

  return { notifications, loading, error, reload: load };
}