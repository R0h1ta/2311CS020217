import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';
import AllNotificationsPage from './pages/AllNotificationsPage';
import PriorityNotificationsPage from './pages/PriorityNotificationsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Campus Notifications</Typography>
          <Button color="inherit" component={Link} to="/">All</Button>
          <Button color="inherit" component={Link} to="/priority">Priority</Button>
        </Toolbar>
      </AppBar>
      <Routes>
        <Route path="/" element={<AllNotificationsPage />} />
        <Route path="/priority" element={<PriorityNotificationsPage />} />
      </Routes>
    </BrowserRouter>
  );
}