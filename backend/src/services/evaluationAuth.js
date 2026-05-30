import { config } from "../config.js";

const tokenCache = {
  api: {
    token: config.evaluationApiToken,
    expiresAt: normalizeExpiry(config.evaluationApiTokenExpiresAt),
  },
  log: {
    token: config.evaluationLogToken,
    expiresAt: normalizeExpiry(config.evaluationLogTokenExpiresAt),
  },
};

function normalizeExpiry(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 1_000_000_000_000) {
    return value;
  }

  if (value >= 1_000_000_000) {
    return value * 1000;
  }

  return Date.now() + value * 1000;
}

function hasAuthCredentials() {
  return Boolean(
    config.evaluationAuthUrl &&
      config.evaluationAuth.email &&
      config.evaluationAuth.name &&
      config.evaluationAuth.rollNo &&
      config.evaluationAuth.accessCode &&
      config.evaluationAuth.clientId &&
      config.evaluationAuth.clientSecret,
  );
}

async function requestEvaluationAccessToken() {
  if (!hasAuthCredentials()) {
    return null;
  }

  const response = await fetch(config.evaluationAuthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email: config.evaluationAuth.email,
      name: config.evaluationAuth.name,
      rollNo: config.evaluationAuth.rollNo,
      accessCode: config.evaluationAuth.accessCode,
      clientID: config.evaluationAuth.clientId,
      clientSecret: config.evaluationAuth.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `evaluation auth request failed (${response.status}): ${errorText}`,
    );
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("evaluation auth response did not include access_token");
  }

  return {
    token: payload.access_token,
    expiresAt: normalizeExpiry(payload.expires_in),
  };
}

export async function getEvaluationAccessToken(purpose = "api") {
  const cached = tokenCache[purpose];
  if (!cached) {
    throw new Error(`unknown evaluation token purpose: ${purpose}`);
  }

  const now = Date.now();
  if (cached.token && (!cached.expiresAt || now < cached.expiresAt - 60_000)) {
    return cached.token;
  }

  const refreshed = await requestEvaluationAccessToken();
  if (!refreshed) {
    return cached.token || null;
  }

  tokenCache[purpose] = refreshed;
  return refreshed.token;
}
