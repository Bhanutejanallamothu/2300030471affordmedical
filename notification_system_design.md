# Stage 1

## Core actions

The platform needs four user-facing actions and one live-delivery channel:

1. List notifications with pagination and optional type filtering.
2. Mark one notification as read.
3. Mark the visible notification set as read in bulk.
4. Fetch a ranked "priority inbox" view.
5. Push real-time notification events to connected users.

## API contract

### `GET /api/v1/notifications`

Fetch a page of notifications for the logged-in student.

**Headers**

```http
Authorization: Bearer <token>
X-Student-Id: 1042
Accept: application/json
```

**Query parameters**

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `page` | integer | No | Defaults to `1` |
| `limit` | integer | No | Defaults to `10`, max `100` |
| `notification_type` | enum | No | `Event`, `Result`, `Placement` |

**Example request**

```http
GET /api/v1/notifications?page=1&limit=10&notification_type=Placement HTTP/1.1
Host: localhost:4000
Authorization: Bearer <token>
X-Student-Id: 1042
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "id": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
      "type": "Placement",
      "message": "CSX Corporation hiring",
      "timestamp": "2026-04-22 17:51:18",
      "source": "evaluation-service",
      "isRead": false,
      "readAt": null
    }
  ],
  "meta": {
    "source": "live",
    "usedSample": false,
    "page": 1,
    "limit": 10,
    "total": 27,
    "unreadCount": 1
  }
}
```

### `PATCH /api/v1/notifications/{id}/read`

Mark a single notification as read or unread.

**Headers**

```http
Authorization: Bearer <token>
Content-Type: application/json
X-Student-Id: 1042
```

**Request body**

```json
{
  "studentId": "1042",
  "isRead": true
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "notificationId": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
    "isRead": true,
    "readAt": "2026-05-30T05:10:21.349Z"
  }
}
```

### `POST /api/v1/notifications/read-all`

Bulk-mark a filtered set as read.

**Headers**

```http
Authorization: Bearer <token>
Content-Type: application/json
X-Student-Id: 1042
```

**Request body**

```json
{
  "studentId": "1042",
  "notificationType": "Placement"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "updatedCount": 12,
    "readAt": "2026-05-30T05:11:10.421Z"
  }
}
```

### `GET /api/v1/notifications/priority`

Return the top `n` unread notifications ranked by business priority and recency.

**Headers**

```http
Authorization: Bearer <token>
X-Student-Id: 1042
Accept: application/json
```

**Query parameters**

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `limit` | integer | No | Defaults to `10`, max `50` |
| `notification_type` | enum | No | Optional filter before ranking |

**Response**

```json
{
  "data": [
    {
      "id": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
      "type": "Placement",
      "message": "CSX Corporation hiring",
      "timestamp": "2026-04-22 17:51:18",
      "source": "evaluation-service",
      "isRead": false,
      "readAt": null
    }
  ],
  "meta": {
    "source": "live",
    "usedSample": false,
    "limit": 10,
    "candidateCount": 120
  }
}
```

## Real-time delivery mechanism

I would use **Server-Sent Events (SSE)** for the student-facing notification stream because this is a server-to-client use case: the server needs to push new notifications, read-state updates, and heartbeat events, but the browser does not need to send arbitrary low-latency messages back over the same socket.

### `GET /api/v1/notifications/stream`

**Headers**

```http
Authorization: Bearer <token>
X-Student-Id: 1042
Accept: text/event-stream
Cache-Control: no-cache
```

**Events**

```text
event: connected
data: {"studentId":"1042","emittedAt":"2026-05-30T05:14:05.000Z"}

event: notifications.new
data: {"count":2,"items":[...],"emittedAt":"2026-05-30T05:14:30.000Z"}

event: notifications.read
data: {"studentId":"1042","notificationId":"...","isRead":true}
```

### Why SSE fits here

- It is lighter than WebSockets for one-way notification fanout.
- Browsers reconnect automatically, which improves resilience on shaky student networks.
- It works cleanly with a reverse proxy and does not require a stateful socket protocol for this feature set.

If the product later needs two-way chat, presence, or collaborative actions, I would upgrade the real-time layer to WebSockets while keeping the REST contract intact.

# Stage 2

## Recommended persistence layer

I would use **MySQL 8** for this system.

### Why MySQL is a good fit

- The assignment already frames the system around relational access patterns such as filtering by student, read state, notification type, and creation date.
- Read-state updates and bulk notification jobs benefit from strong transactional guarantees.
- Composite indexes, generated columns, and JSON metadata are all available in modern MySQL.
- The team can scale this design vertically first and then partition or shard by `student_id` later if the traffic warrants it.

## Schema

The complete schema is in [schema.sql](/d:/2300030471affordmedical/schema.sql). The main tables are:

- `students`: master student records keyed by an internal numeric ID plus the external student identifier.
- `notifications`: one row per in-app notification, with `notification_type`, `is_read`, `created_at`, and a generated `priority_weight`.
- `notification_read_states`: a lightweight overlay table used by the backend in this repo when the upstream evaluation API is treated as the source of truth.
- `notification_batches`: tracks large fanout jobs such as "Notify All".
- `notification_batch_recipients`: per-recipient delivery and retry state.
- `outbox_events`: durable event queue for async workers.

## Likely scale problems and fixes

### Problem 1: slow student unread queries

- Cause: millions of rows with no covering index.
- Fix: add a composite index on `(student_id, is_read, created_at DESC)`.

### Problem 2: heavy write amplification during placement season

- Cause: indexing every column and synchronously writing email + app delivery state.
- Fix: keep only workload-driven indexes, batch inserts, and move delivery fanout into a queue.

### Problem 3: old data inflating storage and cache misses

- Cause: notifications grow indefinitely.
- Fix: add retention rules, archive old rows to cold storage, and consider partitioning `notifications` by time or hashed student ranges.

### Problem 4: repeated unread-count requests

- Cause: every page load hits the database for the same student.
- Fix: cache unread counts and first-page notification lists in Redis with short TTLs, then invalidate via the outbox or SSE update flow.

## SQL for the designed APIs

### List notifications

```sql
SELECT
  id,
  notification_type,
  message,
  is_read,
  read_at,
  created_at
FROM notifications
WHERE student_id = ?
  AND (? IS NULL OR notification_type = ?)
ORDER BY created_at DESC
LIMIT ? OFFSET ?;
```

### Mark one notification as read

```sql
UPDATE notifications
SET is_read = TRUE,
    read_at = NOW(),
    updated_at = NOW()
WHERE id = ?
  AND student_id = ?;
```

### Mark all filtered notifications as read

```sql
UPDATE notifications
SET is_read = TRUE,
    read_at = NOW(),
    updated_at = NOW()
WHERE student_id = ?
  AND is_read = FALSE
  AND (? IS NULL OR notification_type = ?);
```

### Priority inbox query

```sql
SELECT
  id,
  notification_type,
  message,
  created_at,
  priority_weight
FROM notifications
WHERE student_id = ?
  AND is_read = FALSE
  AND (? IS NULL OR notification_type = ?)
ORDER BY priority_weight DESC, created_at DESC
LIMIT ?;
```

# Stage 3

## Is the original query accurate?

The original query is **structurally close**, but it is not ideal:

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

- It does filter unread notifications for one student correctly.
- `SELECT *` pulls more columns than the API usually needs.
- `ORDER BY createdAt ASC` returns the oldest unread items first. For a notification feed, `DESC` is usually the better product behavior.

## Why it is slow

Without a composite index, the database likely performs:

1. A scan across a very large portion of the `notifications` table.
2. A filter on `studentID` and `isRead`.
3. A filesort on `createdAt`.

At roughly 5,000,000 notifications, that becomes expensive in both I/O and CPU. In simple terms, the cost is close to **O(N)** for the scan plus sorting overhead, while an indexed query is closer to **O(log N + K)** where `K` is the number of matching unread rows for that student.

## What I would change

I would add this index:

```sql
CREATE INDEX idx_notifications_student_read_created
ON notifications (studentID, isRead, createdAt DESC);
```

Then I would tighten the query:

```sql
SELECT id, notificationType, message, createdAt
FROM notifications
WHERE studentID = 1042
  AND isRead = FALSE
ORDER BY createdAt DESC;
```

## Is indexing every column a good idea?

No. Indexing every column is not safe or effective.

- Every insert and update becomes slower because each index must also be updated.
- Disk usage increases significantly.
- The optimizer may still ignore many of those indexes if they do not match the query shape.

The right strategy is to index based on real access patterns, not fear.

## Query for students who got a placement notification in the last 7 days

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL 7 DAY;
```

# Stage 4

The current problem is that every page load forces a database read even when the notification list has not changed. I would use a layered mitigation strategy.

## Strategy 1: backend cache for hot reads

- Cache the unread count and the first page of recent notifications in Redis.
- TTL can stay short, for example 30 to 60 seconds.
- Invalidate the cache when new notifications are created or when the student marks items as read.

**Tradeoff:** faster reads, but now the team owns cache invalidation complexity.

## Strategy 2: frontend state reuse

- Keep the currently fetched notification list and unread count in frontend state.
- Reuse it while the user moves around the app instead of refetching on each page change.
- Persist viewed IDs in local storage if needed for a smoother experience across refreshes.

**Tradeoff:** cheap and fast, but different tabs can briefly diverge until the next refresh or SSE event.

## Strategy 3: event-driven refresh

- Replace aggressive polling with SSE or controlled polling.
- Push new notifications to connected clients only when something changes.
- Trigger targeted refetches after a `notifications.new` event instead of on every route transition.

**Tradeoff:** lower database pressure and better UX, but the system needs connection management and heartbeat monitoring.

## Strategy 4: API efficiency improvements

- Return only the fields the UI actually needs.
- Paginate early and cap `limit`.
- Add ETags or `Last-Modified` headers for cache-aware clients.

**Tradeoff:** smaller payloads and lower network cost, but more API design discipline is required.

# Stage 5

## Problems with the synchronous `notify_all` loop

- It is single-threaded and blocks on every external email request.
- If `send_email` fails midway, the system ends up in a partial-delivery state.
- The user request may time out long before 50,000 students are processed.
- The whole flow is tightly coupled, so email slowness delays in-app notifications too.
- There is no retry policy, idempotency key, or audit trail for failed recipients.

## What happens if `send_email` fails for 200 students?

Without redesign, the answer is "we do not know reliably." Some students may already have:

- received the in-app notification but not the email,
- received neither,
- or been skipped after the process crashed.

That is exactly why saving business intent and delivering side effects must be decoupled.

## Should DB save and email send happen together?

They should be related, but not executed as one long synchronous unit.

- The **database save** of the notification intent must happen first and transactionally.
- The **email send** should happen asynchronously through a durable queue.

That way the system never forgets that a student was supposed to be notified, even if the email provider is down.

## Reliable redesign

1. Create one `notification_batches` row for the HR action.
2. Insert all recipient records and notification rows in bulk.
3. Write matching `outbox_events` rows in the same transaction.
4. Commit.
5. Background workers consume outbox events and push:
   - in-app notification fanout,
   - email delivery,
   - retry scheduling for failures.
6. Failed email attempts move to `retrying` with exponential backoff and a capped retry count.
7. After retries are exhausted, the record stays failed for operational review.

## Revised pseudocode

```python
function notify_all(student_ids: array, message: string, notification_type: string):
    batch_id = begin_transaction()

    try:
        insert into notification_batches(status="queued", total_recipients=len(student_ids))

        for student_id in student_ids:
            notification_id = uuid()

            insert into notifications(
                id=notification_id,
                student_id=student_id,
                notification_type=notification_type,
                message=message,
                is_read=false
            )

            insert into notification_batch_recipients(
                batch_id=batch_id,
                student_id=student_id,
                notification_id=notification_id,
                email_status="queued",
                app_status="queued"
            )

            insert into outbox_events(
                aggregate_type="notification",
                aggregate_id=notification_id,
                event_type="notification.created",
                payload={
                    "student_id": student_id,
                    "notification_id": notification_id,
                    "message": message,
                    "notification_type": notification_type
                },
                status="pending"
            )

        update notification_batches set status="processing"
        commit_transaction()

    except Exception:
        rollback_transaction()
        raise


worker process_outbox():
    while true:
        event = dequeue_next_pending_outbox_event()
        if not event:
            sleep(short_interval)
            continue

        try:
            push_to_app(event.payload.student_id, event.payload)
            mark_app_status(event.payload.notification_id, "sent")

            send_email(event.payload.student_id, event.payload.message)
            mark_email_status(event.payload.notification_id, "sent")

            mark_outbox_event_published(event.id)

        except TransientEmailError as err:
            increment_retry_count(event.id)
            schedule_retry(event.id, exponential_backoff(event.retry_count))
            mark_email_status(event.payload.notification_id, "retrying", str(err))

        except Exception as err:
            mark_outbox_event_failed(event.id, str(err))
            mark_email_status(event.payload.notification_id, "failed", str(err))
```

# Stage 6

## Implementation summary

The executable Stage 6 solution is in [backend/src/priority-inbox.js](/d:/2300030471affordmedical/backend/src/priority-inbox.js).

The shared ranking logic is in [backend/src/lib/priority.js](/d:/2300030471affordmedical/backend/src/lib/priority.js).

## Business rule

- `Placement` gets weight `3`
- `Result` gets weight `2`
- `Event` gets weight `1`
- When weights tie, newer timestamps win

## Why the code is production-friendly

The script fetches notifications from the provided API client layer and then uses a **bounded min-heap** to retain only the best `n` items as it scans the input. For top 10, that means:

- total scan cost: `O(m log 10)` for `m` notifications,
- memory cost: `O(10)`,
- no need to re-sort the entire dataset every time a new notification arrives.

In a streaming production system, each new unread notification would be compared against the current heap root:

- if it ranks lower than the current top-10 floor, discard it,
- otherwise replace the heap root and rebalance in `O(log 10)`.

That keeps the priority inbox fast even when the total notification stream keeps growing.
