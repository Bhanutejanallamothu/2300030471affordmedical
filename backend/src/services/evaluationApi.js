import { config } from "../config.js";
import { Log } from "../utils/logger.js";
import { getEvaluationAccessToken } from "./evaluationAuth.js";

const SAMPLE_NOTIFICATIONS = [
  {
    ID: "d146095a-0d86-4a34-9e69-3900a14576bc",
    Type: "Result",
    Message: "mid-sem",
    Timestamp: "2026-04-22 17:51:30",
  },
  {
    ID: "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
    Type: "Placement",
    Message: "CSX Corporation hiring",
    Timestamp: "2026-04-22 17:51:18",
  },
  {
    ID: "81589ada-0ad3-4f77-9554-f52fb558e09d",
    Type: "Event",
    Message: "farewell",
    Timestamp: "2026-04-22 17:51:06",
  },
  {
    ID: "0005513a-142b-4bbc-8678-eefec65e1ede",
    Type: "Result",
    Message: "mid-sem",
    Timestamp: "2026-04-22 17:50:54",
  },
  {
    ID: "ea836726-c25e-4f21-a72f-544a6af8a37f",
    Type: "Result",
    Message: "project-review",
    Timestamp: "2026-04-22 17:50:42",
  },
  {
    ID: "003cb427-8fc6-47f7-bb00-be228f6b0d2c",
    Type: "Result",
    Message: "external",
    Timestamp: "2026-04-22 17:50:30",
  },
  {
    ID: "e5c4ff20-31bf-4d40-8f02-72fda59e8918",
    Type: "Result",
    Message: "project-review",
    Timestamp: "2026-04-22 17:50:18",
  },
  {
    ID: "1cfce5ee-ad37-4894-8946-d707627176a5",
    Type: "Event",
    Message: "tech-fest",
    Timestamp: "2026-04-22 17:50:06",
  },
  {
    ID: "cf2885a6-45ac-4ba0-b548-6e9e9d4c52c8",
    Type: "Result",
    Message: "project-review",
    Timestamp: "2026-04-22 17:49:54",
  },
  {
    ID: "8a7412bd-6065-4d09-8501-a37f11cc848b",
    Type: "Placement",
    Message: "Advanced Micro Devices Inc. hiring",
    Timestamp: "2026-04-22 17:49:42",
  },
];

function normalizeNotification(notification) {
  return {
    id: notification.ID ?? notification.id,
    type: notification.Type ?? notification.type,
    message: notification.Message ?? notification.message,
    timestamp: notification.Timestamp ?? notification.timestamp,
    source: "evaluation-service",
  };
}

function buildQuery(page, limit, notificationType) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));

  if (notificationType) {
    params.set("notification_type", notificationType);
  }

  return params.toString();
}

function buildSampleResponse({ page, limit, notificationType, fallbackReason }) {
  const filtered = notificationType
    ? SAMPLE_NOTIFICATIONS.filter(
        (notification) => notification.Type === notificationType,
      )
    : SAMPLE_NOTIFICATIONS;
  const offset = (page - 1) * limit;
  const paged = filtered.slice(offset, offset + limit).map(normalizeNotification);

  return {
    items: paged,
    meta: {
      source: "sample",
      usedSample: true,
      fallbackReason,
      page,
      limit,
      total: filtered.length,
    },
  };
}

export async function fetchEvaluationNotifications(
  { page = 1, limit = 20, notificationType } = {},
  options = {},
) {
  const strictAuth = options.strictAuth ?? false;
  let accessToken = config.evaluationApiToken;

  try {
    accessToken = await getEvaluationAccessToken("api");
  } catch (error) {
    if (strictAuth || !config.allowSampleFallback) {
      void Log(
        "backend",
        "error",
        "service",
        `evaluation auth failed without fallback: ${error.message}`,
      );
      throw error;
    }

    void Log(
      "backend",
      "error",
      "service",
      `evaluation auth failed; switching to sample payload: ${error.message}`,
    );
    return buildSampleResponse({
      page,
      limit,
      notificationType,
      fallbackReason: error.message,
    });
  }

  if (!accessToken) {
    if (strictAuth || !config.allowSampleFallback) {
      void Log(
        "backend",
        "error",
        "service",
        "evaluation api token missing while strict authentication is required",
      );
      throw new Error(
        "Missing EVALUATION_API_TOKEN for the protected evaluation API.",
      );
    }

    void Log(
      "backend",
      "warn",
      "service",
      "evaluation api token missing; serving bundled sample notifications",
    );
    return buildSampleResponse({
      page,
      limit,
      notificationType,
      fallbackReason: "missing_token",
    });
  }

  const url = `${config.evaluationApiUrl}?${buildQuery(
    page,
    limit,
    notificationType,
  )}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Evaluation API failed (${response.status}): ${text}`);
    }

    const payload = await response.json();
    const items = (payload.notifications ?? []).map(normalizeNotification);
    void Log(
      "backend",
      "debug",
      "service",
      `fetched ${items.length} notification(s) from evaluation api for page ${page}`,
    );

    return {
      items,
      meta: {
        source: "live",
        usedSample: false,
        page,
        limit,
        total: payload.total ?? items.length,
      },
    };
  } catch (error) {
    if (strictAuth || !config.allowSampleFallback) {
      void Log(
        "backend",
        "error",
        "service",
        `evaluation api request failed without fallback: ${error.message}`,
      );
      throw error;
    }

    void Log(
      "backend",
      "error",
      "service",
      `evaluation api request failed; switching to sample payload: ${error.message}`,
    );
    return buildSampleResponse({
      page,
      limit,
      notificationType,
      fallbackReason: error.message,
    });
  }
}

export async function fetchAllEvaluationNotifications(
  { notificationType, pageSize = 10, maxPages = 10 } = {},
  options = {},
) {
  const safePageSize = Math.min(pageSize, 10);
  const collected = [];
  let lastMeta = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchEvaluationNotifications(
      {
        page,
        limit: safePageSize,
        notificationType,
      },
      options,
    );

    collected.push(...result.items);
    lastMeta = result.meta;

    if (result.meta.usedSample || result.items.length < safePageSize) {
      break;
    }
  }

  const deduped = Array.from(
    new Map(collected.map((item) => [item.id, item])).values(),
  );

  return {
    items: deduped,
    meta: {
      ...(lastMeta ?? {}),
      total: deduped.length,
    },
  };
}
