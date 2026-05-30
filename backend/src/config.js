import dotenv from "dotenv";

dotenv.config();

function getNumber(name, fallback) {
  const raw = process.env[name];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: getNumber("PORT", 4000),
  corsOrigin:
    process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000",
  defaultStudentId: process.env.DEFAULT_STUDENT_ID ?? "1042",
  evaluationApiUrl:
    process.env.EVALUATION_API_URL ??
    "http://4.224.186.213/evaluation-service/notifications",
  evaluationApiToken: process.env.EVALUATION_API_TOKEN ?? "",
  evaluationApiTokenExpiresAt:
    process.env.EVALUATION_API_TOKEN_EXPIRES_AT ?? "",
  evaluationLogUrl:
    process.env.EVALUATION_LOG_URL ??
    "http://4.224.186.213/evaluation-service/logs",
  evaluationLogToken: process.env.EVALUATION_LOG_TOKEN ?? "",
  evaluationLogTokenExpiresAt:
    process.env.EVALUATION_LOG_TOKEN_EXPIRES_AT ?? "",
  evaluationAuthUrl: process.env.EVALUATION_AUTH_URL ?? "",
  evaluationAuth: {
    email: process.env.EVALUATION_EMAIL ?? "",
    name: process.env.EVALUATION_NAME ?? "",
    rollNo: process.env.EVALUATION_ROLL_NO ?? "",
    accessCode: process.env.EVALUATION_ACCESS_CODE ?? "",
    clientId: process.env.EVALUATION_CLIENT_ID ?? "",
    clientSecret: process.env.EVALUATION_CLIENT_SECRET ?? "",
  },
  allowSampleFallback: getBoolean("ALLOW_SAMPLE_FALLBACK", true),
  livePollIntervalMs: getNumber("LIVE_POLL_INTERVAL_MS", 30000),
  mysql: {
    host: process.env.MYSQL_HOST ?? "",
    port: getNumber("MYSQL_PORT", 3306),
    user: process.env.MYSQL_USER ?? "",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "",
  },
};

export function hasMysqlConfig() {
  return Boolean(
    config.mysql.host &&
      config.mysql.user &&
      config.mysql.database,
  );
}
