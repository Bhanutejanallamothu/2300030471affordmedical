import { Log } from "../utils/logger.js";

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const STUDENT_ID = import.meta.env.VITE_STUDENT_ID ?? "1042";
const EXTERNAL_EVALUATION_HOST = "http://4.224.186.213";

function resolveApiBaseUrl() {
  const trimmed = RAW_API_BASE_URL.trim().replace(/\/+$/, "");

  // The evaluation service is a server-to-server dependency and will fail
  // with browser CORS when used as the frontend API base.
  if (trimmed === EXTERNAL_EVALUATION_HOST) {
    return "http://127.0.0.1:4000";
  }

  return trimmed;
}

const API_BASE_URL = resolveApiBaseUrl();

async function request(path, options = {}) {
  const method = options.method ?? "GET";
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Student-Id": STUDENT_ID,
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    void Log(
      "frontend",
      "error",
      "api",
      `${method} ${path} could not reach the notification backend: ${error.message}`,
    );
    throw error;
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const errorPayload = await response.json();
      message = errorPayload.error?.message ?? message;
    } catch {}

    void Log(
      "frontend",
      "error",
      "api",
      `${method} ${path} returned status ${response.status}: ${message}`,
    );
    throw new Error(message);
  }

  void Log(
    "frontend",
    "debug",
    "api",
    `${method} ${path} completed with status ${response.status}`,
  );
  return response.json();
}

export function fetchNotifications({ page, limit, notificationType }) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (notificationType) {
    params.set("notification_type", notificationType);
  }

  return request(`/api/v1/notifications?${params.toString()}`);
}

export function fetchPriorityNotifications({ limit, notificationType }) {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (notificationType) {
    params.set("notification_type", notificationType);
  }

  return request(`/api/v1/notifications/priority?${params.toString()}`);
}

export function markNotificationRead(notificationId, isRead = true) {
  return request(`/api/v1/notifications/${notificationId}/read`, {
    method: "PATCH",
    body: {
      studentId: STUDENT_ID,
      isRead,
    },
  });
}

export function markAllNotificationsRead(notificationType) {
  return request("/api/v1/notifications/read-all", {
    method: "POST",
    body: {
      studentId: STUDENT_ID,
      notificationType: notificationType || null,
    },
  });
}

export function subscribeToNotifications(onMessage) {
  const streamBase = API_BASE_URL || window.location.origin;
  const url = new URL("/api/v1/notifications/stream", streamBase);
  url.searchParams.set("student_id", STUDENT_ID);

  const source = new EventSource(url);
  source.onopen = () => {
    void Log(
      "frontend",
      "info",
      "api",
      "connected to the live notification stream",
    );
  };
  const events = [
    "connected",
    "notifications.new",
    "notifications.read",
    "notifications.read_all",
    "notifications.heartbeat",
    "notifications.error",
    "ping",
  ];

  for (const eventName of events) {
    source.addEventListener(eventName, (event) => {
      try {
        onMessage({
          type: eventName,
          data: JSON.parse(event.data),
        });
      } catch {
        onMessage({
          type: eventName,
          data: event.data,
        });
      }
    });
  }

  source.onerror = () => {
    void Log(
      "frontend",
      "warn",
      "api",
      "live notification stream disconnected unexpectedly",
    );
    onMessage({
      type: "stream.error",
      data: {
        message: "Live notification channel disconnected.",
      },
    });
  };

  return () => {
    source.close();
    void Log(
      "frontend",
      "debug",
      "api",
      "closed the live notification stream subscription",
    );
  };
}
