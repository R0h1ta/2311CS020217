import axios from 'axios';

const BASE_URL = 'http://4.224.186.213/evaluation-service/notifications';

export async function fetchNotifications({ limit, page, notification_type } = {}) {
  const params = {};
  if (limit) params.limit = limit;
  if (page) params.page = page;
  if (notification_type) params.notification_type = notification_type;

  const response = await axios.get(BASE_URL, {
    params,
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_ACCESS_TOKEN}`
    }
  });
  return response.data.notifications;
}