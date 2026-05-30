import { selectTopNotifications } from "./lib/priority.js";
import { fetchEvaluationNotifications } from "./services/evaluationApi.js";

const requestedLimit = Number(process.argv[2] ?? "10");
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
  ? requestedLimit
  : 10;

try {
  const result = await fetchEvaluationNotifications(
    { page: 1, limit: 200 },
    { strictAuth: false },
  );

  if (result.meta.usedSample) {
    console.warn(
      "Protected API token not configured, using the provided sample payload.",
    );
  }

  const topNotifications = selectTopNotifications(
    result.items.map((item) => ({
      ...item,
      isRead: false,
    })),
    limit,
    { unreadOnly: true },
  );

  console.log(
    JSON.stringify(
      {
        source: result.meta.source,
        limit,
        topNotifications,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Failed to build the priority inbox:", error.message);
  process.exitCode = 1;
}
