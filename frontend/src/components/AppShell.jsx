import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { Log } from "../utils/logger.js";

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Priority Inbox", to: "/priority" },
];

export function AppShell() {
  const location = useLocation();

  useEffect(() => {
    void Log(
      "frontend",
      "info",
      "page",
      `navigated to ${location.pathname || "/"}`,
    );
  }, [location.pathname]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(15,118,110,0.2), transparent 35%), radial-gradient(circle at top right, rgba(249,115,22,0.18), transparent 30%), #f6f3ec",
      }}
    >
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(15,23,42,0.08)" }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ py: 1.5, gap: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexGrow: 1 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 3,
                  display: "grid",
                  placeItems: "center",
                  background:
                    "linear-gradient(145deg, rgba(15,118,110,0.95), rgba(249,115,22,0.9))",
                  color: "white",
                  boxShadow: "0 16px 32px rgba(15, 118, 110, 0.22)",
                }}
              >
                <NotificationsActiveRoundedIcon />
              </Box>
              <Box>
                <Typography variant="h6">Afford Notification Hub</Typography>
                <Typography variant="body2" color="text.secondary">
                  Responsive student inbox with priority ranking and live updates
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {navItems.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Button
                    key={item.to}
                    component={Link}
                    to={item.to}
                    variant={active ? "contained" : "text"}
                    color={active ? "primary" : "inherit"}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
