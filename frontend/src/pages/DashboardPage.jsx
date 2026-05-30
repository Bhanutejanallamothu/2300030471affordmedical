import { startTransition, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Pagination,
  Stack,
  Typography,
} from "@mui/material";

import {
  fetchNotifications,
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
    page: 1,
    limit: 10,
    total: 0,
    source: "unknown",
    usedSample: false,
  },
};

export function DashboardPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState("");
  const [state, setState] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [streamMessage, setStreamMessage] = useState("");

  async function loadNotifications(nextPage = page, nextPageSize = pageSize, nextFilter = filter) {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchNotifications({
        page: nextPage,
        limit: nextPageSize,
        notificationType: nextFilter || null,
      });

      startTransition(() => {
        setState(payload);
      });
      void Log(
        "frontend",
        "info",
        "state",
        `dashboard loaded page ${nextPage} with ${payload.data.length} notification(s) using ${nextFilter || "all"} filter`,
      );
    } catch (requestError) {
      void Log(
        "frontend",
        "error",
        "state",
        `dashboard notification load failed: ${requestError.message}`,
      );
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications(page, pageSize, filter);
  }, [page, pageSize, filter]);

  useEffect(() => {
    return subscribeToNotifications((event) => {
      if (event.type === "notifications.new") {
        void Log(
          "frontend",
          "info",
          "state",
          `dashboard received ${event.data.count} newly announced notification(s)`,
        );
        setStreamMessage(`${event.data.count} new notification(s) detected.`);
        loadNotifications(page, pageSize, filter);
      }

      if (event.type === "notifications.read" || event.type === "notifications.read_all") {
        loadNotifications(page, pageSize, filter);
      }
    });
  }, [page, pageSize, filter]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const retryTimer = setTimeout(() => {
      loadNotifications(page, pageSize, filter);
    }, 2000);

    return () => clearTimeout(retryTimer);
  }, [error, page, pageSize, filter]);

  const unreadCount = state.data.filter((notification) => !notification.isRead).length;
  const hasMaybeNextPage = state.data.length === pageSize;

  const totalPages = Math.max(
    1,
    state.meta.total
      ? Math.ceil(state.meta.total / pageSize)
      : page + (hasMaybeNextPage ? 1 : 0),
  );

  async function handleMarkRead(notification) {
    try {
      await markNotificationRead(notification.id, true);
      void Log(
        "frontend",
        "info",
        "component",
        `marked dashboard notification ${notification.id} as read`,
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
        `dashboard mark-read failed for ${notification.id}: ${requestError.message}`,
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
        `marked visible dashboard notifications as read for ${filter || "all"} filter`,
      );
      loadNotifications(page, pageSize, filter);
    } catch (requestError) {
      void Log(
        "frontend",
        "error",
        "component",
        `dashboard mark-all-read failed: ${requestError.message}`,
      );
      setError(requestError.message);
    }
  }

  return (
    <Stack spacing={3.5}>
      <Box>
        <Typography variant="h3" gutterBottom>
          All Notifications
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760 }}>
          This dashboard fetches notifications through the new API contract, keeps the
          feed filterable, and surfaces read state clearly so students can quickly scan
          what still needs attention.
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={8}>
          <Box className="hero-card">
            <Typography variant="overline" sx={{ letterSpacing: 1.6 }}>
              Live inbox
            </Typography>
            <Typography variant="h4" sx={{ mt: 1 }}>
              Student-ready notification dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
              Type filters, page controls, and read tracking are wired against the
              backend in `backend/src/index.js`.
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={12} md={4}>
          <Box className="stat-card">
            <Typography variant="body2" color="text.secondary">
              Current source
            </Typography>
            <Typography variant="h4" sx={{ mt: 1 }}>
              {state.meta.source === "live" ? "Protected API" : "Sample payload"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Unread shown now: {unreadCount}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      <NotificationsToolbar
        filter={filter}
        pageSize={pageSize}
        unreadCount={unreadCount}
        onFilterChange={(value) => {
          setPage(1);
          setFilter(value);
        }}
        onPageSizeChange={(value) => {
          setPage(1);
          setPageSize(value);
        }}
        onMarkAllRead={handleMarkAllRead}
        busy={loading}
      />

      {streamMessage ? (
        <Alert severity="info" onClose={() => setStreamMessage("")}>
          {streamMessage}
        </Alert>
      ) : null}

      {state.meta.usedSample ? (
        <Alert severity="warning">
          The backend is currently serving the provided sample payload. Add
          `EVALUATION_API_TOKEN` in `backend/.env` to call the protected evaluation
          API directly.
        </Alert>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}

      {loading ? (
        <Stack alignItems="center" py={8}>
          <CircularProgress />
        </Stack>
      ) : (
        <Stack spacing={2}>
          {state.data.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
            />
          ))}
          {state.data.length === 0 ? (
            <Alert severity="info">No notifications match the current filters.</Alert>
          ) : null}
        </Stack>
      )}

      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Typography variant="body2" color="text.secondary">
          Page {page} of {totalPages}
        </Typography>
        <Pagination
          page={page}
          count={totalPages}
          color="primary"
          onChange={(_event, value) => setPage(value)}
        />
        <Stack direction="row" spacing={1}>
          <Button
            variant="text"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="text"
            disabled={!hasMaybeNextPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
