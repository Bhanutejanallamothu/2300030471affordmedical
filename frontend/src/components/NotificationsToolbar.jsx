import {
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";

const notificationTypes = ["", "Placement", "Result", "Event"];

export function NotificationsToolbar({
  filter,
  pageSize,
  limit,
  unreadCount,
  onFilterChange,
  onPageSizeChange,
  onLimitChange,
  onMarkAllRead,
  busy,
}) {
  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
        >
          <Stack spacing={0.5}>
            <Typography variant="h6">Inbox controls</Typography>
            <Typography variant="body2" color="text.secondary">
              Unread in current view: {unreadCount}
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            useFlexGap
            flexWrap="wrap"
          >
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="type-filter-label">Notification type</InputLabel>
              <Select
                labelId="type-filter-label"
                value={filter}
                label="Notification type"
                onChange={(event) => onFilterChange(event.target.value)}
              >
                {notificationTypes.map((type) => (
                  <MenuItem key={type || "all"} value={type}>
                    {type || "All types"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {onPageSizeChange ? (
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel id="page-size-label">Per page</InputLabel>
                <Select
                  labelId="page-size-label"
                  value={pageSize}
                  label="Per page"
                  onChange={(event) =>
                    onPageSizeChange(Number(event.target.value))
                  }
                >
                  {[5, 10, 20, 50].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}

            {onLimitChange ? (
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel id="priority-limit-label">Top N</InputLabel>
                <Select
                  labelId="priority-limit-label"
                  value={limit}
                  label="Top N"
                  onChange={(event) => onLimitChange(Number(event.target.value))}
                >
                  {[5, 10, 15, 20].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}

            <Button
              variant="outlined"
              disabled={busy || unreadCount === 0}
              onClick={onMarkAllRead}
            >
              Mark visible items as read
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
