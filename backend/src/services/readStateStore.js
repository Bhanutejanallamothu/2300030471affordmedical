import mysql from "mysql2/promise";

import { config, hasMysqlConfig } from "../config.js";
import { Log } from "../utils/logger.js";

class MemoryReadStateStore {
  constructor() {
    this.stateByStudent = new Map();
  }

  getStudentState(studentId) {
    if (!this.stateByStudent.has(studentId)) {
      this.stateByStudent.set(studentId, new Map());
    }

    return this.stateByStudent.get(studentId);
  }

  async getReadMap(studentId, notificationIds) {
    const state = this.getStudentState(studentId);
    const result = new Map();

    for (const notificationId of notificationIds) {
      result.set(notificationId, state.get(notificationId) ?? null);
    }

    return result;
  }

  async markRead(studentId, notificationId, isRead = true) {
    const state = this.getStudentState(studentId);
    state.set(notificationId, {
      isRead,
      readAt: isRead ? new Date().toISOString() : null,
    });

    return {
      notificationId,
      isRead,
    };
  }

  async markAllRead(studentId, notificationIds) {
    const state = this.getStudentState(studentId);
    const readAt = new Date().toISOString();

    for (const notificationId of notificationIds) {
      state.set(notificationId, {
        isRead: true,
        readAt,
      });
    }

    return {
      updatedCount: notificationIds.length,
      readAt,
    };
  }

  async close() {}
}

class MysqlReadStateStore {
  constructor(pool) {
    this.pool = pool;
  }

  async getReadMap(studentId, notificationIds) {
    if (notificationIds.length === 0) {
      return new Map();
    }

    const placeholders = notificationIds.map(() => "?").join(", ");
    const [rows] = await this.pool.execute(
      `SELECT notification_id, is_read, read_at
       FROM notification_read_states
       WHERE student_external_id = ?
         AND notification_id IN (${placeholders})`,
      [studentId, ...notificationIds],
    );

    const result = new Map();
    for (const row of rows) {
      result.set(row.notification_id, {
        isRead: Boolean(row.is_read),
        readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      });
    }

    return result;
  }

  async markRead(studentId, notificationId, isRead = true) {
    const readAt = isRead ? new Date() : null;

    await this.pool.execute(
      `INSERT INTO notification_read_states (
         student_external_id,
         notification_id,
         is_read,
         read_at
       ) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_read = VALUES(is_read),
         read_at = VALUES(read_at),
       updated_at = CURRENT_TIMESTAMP`,
      [studentId, notificationId, isRead ? 1 : 0, readAt],
    );
    void Log(
      "backend",
      "debug",
      "db",
      `persisted mysql read-state for notification ${notificationId} on student ${studentId}`,
    );

    return {
      notificationId,
      isRead,
      readAt: readAt ? readAt.toISOString() : null,
    };
  }

  async markAllRead(studentId, notificationIds) {
    if (notificationIds.length === 0) {
      return {
        updatedCount: 0,
        readAt: null,
      };
    }

    const readAt = new Date();
    const placeholders = notificationIds.map(() => "(?, ?, ?, ?)").join(", ");
    const values = [];

    for (const notificationId of notificationIds) {
      values.push(studentId, notificationId, 1, readAt);
    }

    await this.pool.execute(
      `INSERT INTO notification_read_states (
         student_external_id,
         notification_id,
         is_read,
         read_at
       ) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         is_read = VALUES(is_read),
         read_at = VALUES(read_at),
         updated_at = CURRENT_TIMESTAMP`,
      values,
    );
    void Log(
      "backend",
      "debug",
      "db",
      `persisted ${notificationIds.length} mysql read-state record(s) for student ${studentId}`,
    );

    return {
      updatedCount: notificationIds.length,
      readAt: readAt.toISOString(),
    };
  }

  async close() {
    await this.pool.end();
  }
}

export function createReadStateStore() {
  if (!hasMysqlConfig()) {
    void Log(
      "backend",
      "warn",
      "db",
      "mysql read-state configuration missing; using in-memory read-state store",
    );
    return new MemoryReadStateStore();
  }

  const pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: 10,
  });
  void Log(
    "backend",
    "info",
    "db",
    `initialized mysql read-state pool for ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`,
  );

  return new MysqlReadStateStore(pool);
}
