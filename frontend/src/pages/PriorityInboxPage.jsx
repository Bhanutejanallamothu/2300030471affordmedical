import { startTransition, useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from "@mui/material";

import {
  fetchPriorityNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "../api/client.js";
import { NotificationCard } from "../components/NotificationCard.jsx";
import { NotificationsToolbar } from "../components/NotificationsToolbar.jsx";
import { Log } from "../utils/logger.js";

const initialState = {
  data: [],
  meta: {
    source: "unknown",
    usedSample: false,
    limit: 10,
    candidateCount: 0,
  },
};

export function PriorityInboxPage() {
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(10);
  const [state, setState] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPriorityInbox(nextLimit = limit, nextFilter = filter) {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchPriorityNotifications({
        limit: nextLimit,
        notificationType: nextFilter || null,
      });

      startTransition(() => {
        setState(payload);
      });
      void Log(
        "frontend",
        "info",
        "state",
        `priority inbox loaded top ${nextLimit} with ${payload.data.length} ranked notification(s) using ${nextFilter || "all"} filter`,
      );
    } catch (requestError) {
      void Log(
        "frontend",
        "error",
        "state",
        `priority inbox load failed: ${requestError.message}`,
      );
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPriorityInbox(limit, filter);
  }, [limit, filter]);

  useEffect(() => {
    return subscribeToNotifications((event) => {
      if (event.type.startsWith("notifications.")) {
        loadPriorityInbox(limit, filter);
      }
    });
  }, [limit, filter]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const retryTimer = setTimeout(() => {
      loadPriorityInbox(limit, filter);
    }, 2000);

    return () => clearTimeout(retryTimer);
  }, [error, limit, filter]);

  const unreadCount = state.data.filter((notification) => !notification.isRead).length;

  async function handleMarkRead(notification) {
    try {
      await markNotificationRead(notification.id, true);
      void Log(
        "frontend",
        "info",
        "component",
        `marked priority notification ${notification.id} as read`,
      );
      setState((current) => ({
        ...current,
        data: current.data.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      }));
    } catch (requestError) {
      void Log(
        "frontend",
        "error",
        "component",
        `priority mark-read failed for ${notification.id}: ${requestError.message}`,
      );
      setError(requestError.message);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(filter || null);
      void Log(
        "frontend",
        "info",
        "component",
        `marked visible priority notifications as read for ${filter || "all"} filter`,
      );
      loadPriorityInbox(limit, filter);
    } catch (requestError) {
      void Log(
        "frontend",
        "error",
        "component",
        `priority mark-all-read failed: ${requestError.message}`,
      );
      setError(requestError.message);
    }
  }

  return (
    <Stack spacing={3.5}>
      <Box>
        <Typography variant="h3" gutterBottom>
          Priority Inbox
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760 }}>
          The backend ranks notifications by weight first and recency second, so
          `Placement` items always outrank `Result`, which outrank `Event`.
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Box className="hero-card hero-card--secondary">
            <Typography variant="overline" sx={{ letterSpacing: 1.6 }}>
              Ranking model
            </Typography>
            <Typography variant="h4" sx={{ mt: 1 }}>
              Weight + recency, optimized for top N
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
              The selection logic lives in `backend/src/lib/priority.js` and uses a
              bounded min-heap so the top 10 can be maintained in O(log n) per new item.
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={12} md={5}>
          <Box className="stat-card">
            <Typography variant="body2" color="text.secondary">
              Candidate pool
            </Typography>
            <Typography variant="h4" sx={{ mt: 1 }}>
              {state.meta.candidateCount}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Unread in top list: {unreadCount}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      <NotificationsToolbar
        filter={filter}
        limit={limit}
        unreadCount={unreadCount}
        onFilterChange={setFilter}
        onLimitChange={setLimit}
        onMarkAllRead={handleMarkAllRead}
        busy={loading}
      />

      {state.meta.usedSample ? (
        <Alert severity="warning">
          The ranking view is using the bundled sample payload until a bearer token is
          configured for the protected evaluation API.
        </Alert>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}

      {loading ? (
        <Stack alignItems="center" py={8}>
          <CircularProgress />
        </Stack>
      ) : (
        <Stack spacing={2}>
          {state.data.map((notification, index) => (
            <Box key={notification.id}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 0.75, ml: 1 }}
              >
                Rank #{index + 1}
              </Typography>
              <NotificationCard
                notification={notification}
                compact
                onMarkRead={handleMarkRead}
              />
            </Box>
          ))}
          {state.data.length === 0 ? (
            <Alert severity="info">
              No unread notifications match the selected priority filters.
            </Alert>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
