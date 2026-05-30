const STACK_VALUES = Object.freeze(["backend", "frontend"]);
const LEVEL_VALUES = Object.freeze(["debug", "info", "warn", "error", "fatal"]);
const SHARED_PACKAGES = Object.freeze([
  "auth",
  "config",
  "middleware",
  "utils",
]);
const BACKEND_PACKAGES = Object.freeze([
  ...SHARED_PACKAGES,
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
]);
const FRONTEND_PACKAGES = Object.freeze([
  ...SHARED_PACKAGES,
  "api",
  "component",
  "hook",
  "page",
  "state",
  "style",
]);

const warnedKeys = new Set();
const MAX_MESSAGE_LENGTH = 48;

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const RAW_DIRECT_LOG_URL = import.meta.env.VITE_EVALUATION_LOG_URL ?? "";
const DIRECT_LOG_TOKEN = import.meta.env.VITE_EVALUATION_LOG_TOKEN ?? "";
const EXTERNAL_EVALUATION_HOST = "http://4.224.186.213";

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const trimmed = normalizeBaseUrl(RAW_API_BASE_URL);
  if (trimmed === EXTERNAL_EVALUATION_HOST) {
    return "http://127.0.0.1:4000";
  }

  return trimmed;
}

function resolveDirectLogUrl() {
  const trimmed = normalizeBaseUrl(RAW_DIRECT_LOG_URL);

  // The evaluation log endpoint is not browser-CORS compatible, so the
  // frontend should proxy through the backend instead of calling it directly.
  if (!trimmed || trimmed.startsWith(EXTERNAL_EVALUATION_HOST)) {
    return "";
  }

  return trimmed;
}

const API_BASE_URL = resolveApiBaseUrl();
const DIRECT_LOG_URL = resolveDirectLogUrl();

function warnOnce(key, message) {
  if (warnedKeys.has(key)) {
    return;
  }

  warnedKeys.add(key);
  console.warn(`[logger] ${message}`);
}

function isLowercaseString(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.toLowerCase()
  );
}

function normalizeMessage(message) {
  return message.trim().replace(/\s+/g, " ").slice(0, MAX_MESSAGE_LENGTH);
}

function getAllowedPackages(stack) {
  if (stack === "backend") {
    return BACKEND_PACKAGES;
  }

  if (stack === "frontend") {
    return FRONTEND_PACKAGES;
  }

  return [];
}

function validateLogInput(stack, level, packageName, message) {
  if (!isLowercaseString(stack) || !STACK_VALUES.includes(stack)) {
    return {
      ok: false,
      validationError: true,
      reason: `stack must be one of: ${STACK_VALUES.join(", ")}`,
    };
  }

  if (!isLowercaseString(level) || !LEVEL_VALUES.includes(level)) {
    return {
      ok: false,
      validationError: true,
      reason: `level must be one of: ${LEVEL_VALUES.join(", ")}`,
    };
  }

  const allowedPackages = getAllowedPackages(stack);
  if (
    !isLowercaseString(packageName) ||
    !allowedPackages.includes(packageName)
  ) {
    return {
      ok: false,
      validationError: true,
      reason: `package must be one of: ${allowedPackages.join(", ")}`,
    };
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return {
      ok: false,
      validationError: true,
      reason: "message must be a non-empty string",
    };
  }

  const normalizedMessage = normalizeMessage(message);
  return {
    ok: true,
    payload: {
      stack,
      level,
      package: packageName,
      message: normalizedMessage,
    },
  };
}

function getProxyUrl() {
  return `${API_BASE_URL}/api/v1/logs`;
}

async function postLog(url, payload, token) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`log request failed (${response.status}): ${errorText}`);
  }

  return {
    ok: true,
    delivered: true,
  };
}

export async function Log(...args) {
  const [stack, level, packageName, message] = args;
  const validation = validateLogInput(stack, level, packageName, message);

  if (!validation.ok) {
    warnOnce(
      `validation_${validation.reason}`,
      `skipping invalid log payload: ${validation.reason}`,
    );
    return validation;
  }

  try {
    if (DIRECT_LOG_URL && DIRECT_LOG_TOKEN) {
      return await postLog(DIRECT_LOG_URL, validation.payload, DIRECT_LOG_TOKEN);
    }

    return await postLog(getProxyUrl(), validation.payload, "");
  } catch (error) {
    warnOnce(
      `delivery_${validation.payload.stack}_${validation.payload.package}`,
      `frontend telemetry delivery failed for ${validation.payload.stack}/${validation.payload.package}: ${error.message}`,
    );
    return {
      ok: false,
      delivered: false,
      reason: error.message,
    };
  }
}
