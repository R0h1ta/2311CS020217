import { Card, CardContent, Typography, Chip, Box } from '@mui/material';

const typeColors = {
  Placement: 'success',
  Result: 'primary',
  Event: 'warning'
};

export default function NotificationCard({ notification, isRead, onView }) {
  return (
    <Card
      onClick={() => onView(notification.ID)}
      sx={{
        mb: 1.5,
        cursor: 'pointer',
        borderLeft: isRead ? 'none' : '4px solid #1976d2',
        backgroundColor: isRead ? '#fafafa' : '#fff'
      }}
    >
      <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: isRead ? 400 : 700 }}>
            {notification.Message}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(notification.Timestamp).toLocaleString()}
          </Typography>
        </Box>
        <Chip label={notification.Type} color={typeColors[notification.Type] || 'default'} size="small" />
      </CardContent>
    </Card>
  );
}