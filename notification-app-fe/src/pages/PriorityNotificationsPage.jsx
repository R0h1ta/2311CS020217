import { useState, useMemo } from 'react';
import { Container, Typography, CircularProgress, Alert, ToggleButtonGroup, ToggleButton, Box } from '@mui/material';
import { useNotifications } from '../hooks/useNotifications';
import { useReadStatus } from '../hooks/useReadStatus';
import NotificationCard from '../components/NotificationCard';
import NotificationFilter from '../components/NotificationFilter';

const WEIGHT = { Placement: 3, Result: 2, Event: 1 };
const TOP_N_OPTIONS = [10, 15, 20];

export default function PriorityNotificationsPage() {
  const [topN, setTopN] = useState(10);
  const [filterType, setFilterType] = useState('All');

  const { notifications, loading, error } = useNotifications({ limit: 100 });
  const { isRead, markRead } = useReadStatus();

  const prioritized = useMemo(() => {
    let list = [...notifications];
    if (filterType !== 'All') {
      list = list.filter((n) => n.Type === filterType);
    }
    return list
      .sort((a, b) => {
        const wDiff = (WEIGHT[b.Type] || 0) - (WEIGHT[a.Type] || 0);
        if (wDiff !== 0) return wDiff;
        return new Date(b.Timestamp) - new Date(a.Timestamp);
      })
      .slice(0, topN);
  }, [notifications, filterType, topN]);

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Priority Inbox</Typography>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>Show top</Typography>
        <ToggleButtonGroup value={topN} exclusive size="small" onChange={(e, v) => v && setTopN(v)}>
          {TOP_N_OPTIONS.map((n) => (
            <ToggleButton key={n} value={n}>{n}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <NotificationFilter value={filterType} onChange={setFilterType} />

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && prioritized.map((n) => (
        <NotificationCard key={n.ID} notification={n} isRead={isRead(n.ID)} onView={markRead} />
      ))}
    </Container>
  );
}