import { config } from "../config.js";
import { getEvaluationAccessToken } from "../services/evaluationAuth.js";

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

  if (!config.evaluationLogUrl) {
    warnOnce(
      "missing_log_url",
      "EVALUATION_LOG_URL is not configured; skipping external telemetry",
    );
    return {
      ok: false,
      skipped: true,
      reason: "missing_log_url",
    };
  }

  let accessToken = config.evaluationLogToken;
  try {
    accessToken = await getEvaluationAccessToken("log");
  } catch (error) {
    warnOnce(
      "auth_refresh_failed",
      `could not refresh evaluation log token: ${error.message}`,
    );
  }
  if (!accessToken) {
    warnOnce(
      "missing_log_token",
      "evaluation log token is unavailable; skipping external telemetry",
    );
    return {
      ok: false,
      skipped: true,
      reason: "missing_log_token",
    };
  }

  try {
    const response = await fetch(config.evaluationLogUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(validation.payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `evaluation log request failed (${response.status}): ${errorText}`,
      );
    }

    return {
      ok: true,
      delivered: true,
    };
  } catch (error) {
    warnOnce(
      `delivery_${validation.payload.stack}_${validation.payload.package}`,
      `telemetry delivery failed for ${validation.payload.stack}/${validation.payload.package}: ${error.message}`,
    );
    return {
      ok: false,
      delivered: false,
      reason: error.message,
    };
  }
}

export const logOptions = Object.freeze({
  stacks: STACK_VALUES,
  levels: LEVEL_VALUES,
  packages: {
    backend: BACKEND_PACKAGES,
    frontend: FRONTEND_PACKAGES,
    shared: SHARED_PACKAGES,
  },
});
