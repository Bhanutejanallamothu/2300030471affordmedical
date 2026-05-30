import {
  fetchAllEvaluationNotifications,
  fetchEvaluationNotifications,
} from "./evaluationApi.js";
import {
  compareNotificationsForDisplay,
  selectTopNotifications,
} from "../lib/priority.js";
import { Log } from "../utils/logger.js";

export class NotificationService {
  constructor(readStateStore) {
    this.readStateStore = readStateStore;
  }

  async attachReadState(studentId, notifications) {
    const readMap = await this.readStateStore.getReadMap(
      studentId,
      notifications.map((notification) => notification.id),
    );

    return notifications.map((notification) => {
      const state = readMap.get(notification.id);
      return {
        ...notification,
        isRead: state?.isRead ?? false,
        readAt: state?.readAt ?? null,
      };
    });
  }

  async getNotifications({ studentId, page, limit, notificationType }) {
    const result = await fetchEvaluationNotifications({
      page,
      limit,
      notificationType,
    });
    const items = await this.attachReadState(studentId, result.items);
    void Log(
      "backend",
      "debug",
      "service",
      `prepared notification page ${page} with ${items.length} item(s) for student ${studentId}`,
    );

    return {
      items,
      meta: {
        ...result.meta,
        unreadCount: items.filter((item) => !item.isRead).length,
      },
    };
  }

  async getPriorityNotifications({ studentId, limit, notificationType }) {
    const result = await fetchAllEvaluationNotifications({
      notificationType,
    });
    const items = await this.attachReadState(studentId, result.items);
    const topItems = selectTopNotifications(items, limit, {
      unreadOnly: true,
    });
    void Log(
      "backend",
      "info",
      "service",
      `ranked ${items.length} candidate notification(s) into top ${topItems.length} for student ${studentId}`,
    );

    return {
      items: topItems,
      meta: {
        ...result.meta,
        limit,
        candidateCount: items.length,
      },
    };
  }

  async markRead({ studentId, notificationId, isRead = true }) {
    return this.readStateStore.markRead(studentId, notificationId, isRead);
  }

  async markAllRead({ studentId, notificationType }) {
    const result = await fetchAllEvaluationNotifications({
      notificationType,
    });
    void Log(
      "backend",
      "info",
      "service",
      `resolved ${result.items.length} notification id(s) for mark-all-read on student ${studentId}`,
    );

    return this.readStateStore.markAllRead(
      studentId,
      result.items.map((item) => item.id),
    );
  }

  async getLatestSnapshot({ notificationType }) {
    const result = await fetchEvaluationNotifications({
      page: 1,
      limit: 25,
      notificationType,
    });

    return result.items.sort(compareNotificationsForDisplay);
  }
}
