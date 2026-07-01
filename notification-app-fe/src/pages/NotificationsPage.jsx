import { useState } from 'react';
import { Container, Typography, CircularProgress, Alert, Pagination, Box } from '@mui/material';
import { useNotifications } from '../hooks/useNotifications';
import { useReadStatus } from '../hooks/useReadStatus';
import NotificationCard from '../components/NotificationCard';
import NotificationFilter from '../components/NotificationFilter';

export default function AllNotificationsPage() {
  const [filterType, setFilterType] = useState('All');
  const [page, setPage] = useState(1);
  const limit = 10;

  const { notifications, loading, error } = useNotifications({
    limit,
    page,
    notification_type: filterType === 'All' ? undefined : filterType
  });

  const { isRead, markRead } = useReadStatus();

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>All Notifications</Typography>

      <NotificationFilter value={filterType} onChange={(t) => { setFilterType(t); setPage(1); }} />

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && notifications.length === 0 && (
        <Typography color="text.secondary">No notifications found.</Typography>
      )}

      {!loading && notifications.map((n) => (
        <NotificationCard key={n.ID} notification={n} isRead={isRead(n.ID)} onView={markRead} />
      ))}

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
        <Pagination count={5} page={page} onChange={(e, p) => setPage(p)} />
      </Box>
    </Container>
  );
}