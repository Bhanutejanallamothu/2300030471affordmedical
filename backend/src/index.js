import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { createReadStateStore } from "./services/readStateStore.js";
import { NotificationService } from "./services/notificationService.js";
import { Log } from "./utils/logger.js";

const ALLOWED_NOTIFICATION_TYPES = new Set(["Event", "Result", "Placement"]);
const allowedOrigins = config.corsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function parsePositiveInteger(value, fallback, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(parsed), max);
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getStudentId(request) {
  return (
    request.query.student_id ??
    request.body?.studentId ??
    request.headers["x-student-id"] ??
    config.defaultStudentId
  );
}

function getNotificationType(request) {
  const value =
    request.query.notification_type ??
    request.body?.notificationType ??
    null;

  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (!ALLOWED_NOTIFICATION_TYPES.has(value)) {
    void Log(
      "backend",
      "warn",
      "route",
      `received unsupported notification_type "${String(value)}"`,
    );
    throw createHttpError(
      400,
      "notification_type must be one of Event, Result, or Placement.",
    );
  }

  return value;
}

const app = express();
const readStateStore = createReadStateStore();
const notificationService = new NotificationService(readStateStore);
const sseClients = new Set();
let lastSeenIds = [];

function broadcast(eventName, payload) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of sseClients) {
    client.write(frame);
  }
}

async function pollForLiveUpdates() {
  try {
    const snapshot = await notificationService.getLatestSnapshot({});
    const ids = snapshot.map((item) => item.id);

    if (lastSeenIds.length === 0) {
      lastSeenIds = ids;
      return;
    }

    const newItems = snapshot.filter((item) => !lastSeenIds.includes(item.id));
    lastSeenIds = ids;

    if (newItems.length > 0) {
      void Log(
        "backend",
        "info",
        "service",
        `broadcasting ${newItems.length} new notification(s) to ${sseClients.size} stream client(s)`,
      );
      broadcast("notifications.new", {
        count: newItems.length,
        items: newItems,
        emittedAt: new Date().toISOString(),
      });
      return;
    }

    broadcast("notifications.heartbeat", {
      emittedAt: new Date().toISOString(),
    });
  } catch (error) {
    void Log(
      "backend",
      "error",
      "service",
      `live update poll failed: ${error.message}`,
    );
    broadcast("notifications.error", {
      message: error.message,
      emittedAt: new Date().toISOString(),
    });
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(createHttpError(403, `Origin ${origin} is not allowed by CORS.`));
    },
    credentials: false,
  }),
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/v1/logs", async (request, response) => {
  const payload = request.body ?? {};
  const result = await Log(
    payload.stack,
    payload.level,
    payload.package,
    payload.message,
  );

  response.status(result.validationError ? 400 : 202).json({
    success: result.ok,
    meta: result,
  });
});

app.get("/api/v1/notifications", async (request, response, next) => {
  try {
    const page = parsePositiveInteger(request.query.page, 1);
    const limit = parsePositiveInteger(request.query.limit, 10, 100);
    const studentId = String(getStudentId(request));
    const notificationType = getNotificationType(request);

    const result = await notificationService.getNotifications({
      studentId,
      page,
      limit,
      notificationType,
    });

    response.json({
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/notifications/priority", async (request, response, next) => {
  try {
    const limit = parsePositiveInteger(request.query.limit, 10, 50);
    const studentId = String(getStudentId(request));
    const notificationType = getNotificationType(request);

    const result = await notificationService.getPriorityNotifications({
      studentId,
      limit,
      notificationType,
    });

    response.json({
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/notifications/:id/read", async (request, response, next) => {
  try {
    const studentId = String(getStudentId(request));
    const isRead = request.body?.isRead ?? true;

    const result = await notificationService.markRead({
      studentId,
      notificationId: request.params.id,
      isRead: Boolean(isRead),
    });

    void Log(
      "backend",
      "info",
      "route",
      `updated notification ${request.params.id} to isread=${Boolean(isRead)} for student ${studentId}`,
    );
    broadcast("notifications.read", {
      studentId,
      notificationId: request.params.id,
      isRead: Boolean(isRead),
      emittedAt: new Date().toISOString(),
    });

    response.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/notifications/read-all", async (request, response, next) => {
  try {
    const studentId = String(getStudentId(request));
    const notificationType = getNotificationType(request);

    const result = await notificationService.markAllRead({
      studentId,
      notificationType,
    });

    void Log(
      "backend",
      "info",
      "route",
      `marked ${result.updatedCount} notification(s) as read for student ${studentId} using ${notificationType ?? "all"} filter`,
    );
    broadcast("notifications.read_all", {
      studentId,
      notificationType,
      updatedCount: result.updatedCount,
      emittedAt: new Date().toISOString(),
    });

    response.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/notifications/stream", (request, response) => {
  const studentId = String(getStudentId(request));

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  sseClients.add(response);
  response.write(
    `event: connected\ndata: ${JSON.stringify({
      studentId,
      emittedAt: new Date().toISOString(),
    })}\n\n`,
  );
  void Log(
    "backend",
    "debug",
    "middleware",
    `opened notification stream for student ${studentId}`,
  );

  const heartbeat = setInterval(() => {
    response.write(
      `event: ping\ndata: ${JSON.stringify({
        emittedAt: new Date().toISOString(),
      })}\n\n`,
    );
  }, 15000);

  request.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(response);
    response.end();
    void Log(
      "backend",
      "debug",
      "middleware",
      `closed notification stream for student ${studentId}`,
    );
  });
});

app.use((error, request, response, _next) => {
  const status = error.status ?? 500;
  void Log(
    "backend",
    status >= 500 ? "error" : "warn",
    "middleware",
    `${request.method} ${request.originalUrl} failed with status ${status}: ${error.message ?? "Unexpected server error"}`,
  );
  response.status(status).json({
    error: {
      message: error.message ?? "Unexpected server error",
      status,
    },
  });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Backend listening on http://${config.host}:${config.port}`);
  void Log(
    "backend",
    "info",
    "config",
    `notification backend listening on ${config.host}:${config.port}`,
  );
});

const pollingTimer = setInterval(pollForLiveUpdates, config.livePollIntervalMs);
pollForLiveUpdates();

async function shutdown() {
  clearInterval(pollingTimer);
  server.close();
  await readStateStore.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
