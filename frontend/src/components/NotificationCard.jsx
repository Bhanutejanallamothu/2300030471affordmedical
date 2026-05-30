import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";

const typeColorMap = {
  Placement: "success",
  Result: "warning",
  Event: "info",
};

export function NotificationCard({
  notification,
  onMarkRead,
  compact = false,
}) {
  const {
    id,
    type,
    message,
    timestamp,
    isRead,
  } = notification;

  return (
    <Card
      sx={{
        borderColor: isRead ? "rgba(15, 23, 42, 0.08)" : "rgba(15, 118, 110, 0.35)",
        background: isRead
          ? "rgba(255, 253, 248, 0.92)"
          : "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(224, 255, 245, 0.95))",
      }}
    >
      <CardContent sx={{ p: compact ? 2.25 : 2.75 }}>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={1}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                label={type}
                color={typeColorMap[type] ?? "default"}
                variant="filled"
                size="small"
              />
              <Chip
                label={isRead ? "Viewed" : "Unread"}
                variant={isRead ? "outlined" : "filled"}
                color={isRead ? "default" : "primary"}
                size="small"
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {timestamp}
            </Typography>
          </Stack>

          <Typography variant="h6" sx={{ fontSize: compact ? "1rem" : "1.12rem" }}>
            {message}
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ wordBreak: "break-all" }}
            >
              Ref: {id}
            </Typography>

            {!isRead && onMarkRead ? (
              <Button
                variant="contained"
                size="small"
                onClick={() => onMarkRead(notification)}
              >
                Mark as read
              </Button>
            ) : (
              <Box sx={{ minHeight: 32 }} />
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
