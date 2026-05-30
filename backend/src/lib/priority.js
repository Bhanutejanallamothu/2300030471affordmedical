export const NOTIFICATION_WEIGHTS = Object.freeze({
  Placement: 3,
  Result: 2,
  Event: 1,
});

export function toTimestampValue(timestamp) {
  if (!timestamp) {
    return 0;
  }

  const normalized = timestamp.includes("T")
    ? timestamp
    : timestamp.replace(" ", "T");
  const value = Date.parse(normalized);
  return Number.isNaN(value) ? 0 : value;
}

export function compareNotificationsForDisplay(left, right) {
  const weightDifference =
    (NOTIFICATION_WEIGHTS[right.type] ?? 0) -
    (NOTIFICATION_WEIGHTS[left.type] ?? 0);

  if (weightDifference !== 0) {
    return weightDifference;
  }

  return toTimestampValue(right.timestamp) - toTimestampValue(left.timestamp);
}

function compareNotificationsForHeap(left, right) {
  const weightDifference =
    (NOTIFICATION_WEIGHTS[left.type] ?? 0) -
    (NOTIFICATION_WEIGHTS[right.type] ?? 0);

  if (weightDifference !== 0) {
    return weightDifference;
  }

  return toTimestampValue(left.timestamp) - toTimestampValue(right.timestamp);
}

class NotificationMinHeap {
  constructor() {
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  peek() {
    return this.items[0] ?? null;
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  replaceTop(item) {
    if (this.items.length === 0) {
      this.items[0] = item;
      return;
    }

    this.items[0] = item;
    this.bubbleDown(0);
  }

  toArray() {
    return [...this.items];
  }

  bubbleUp(index) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (
        compareNotificationsForHeap(
          this.items[currentIndex],
          this.items[parentIndex],
        ) >= 0
      ) {
        break;
      }

      [this.items[currentIndex], this.items[parentIndex]] = [
        this.items[parentIndex],
        this.items[currentIndex],
      ];
      currentIndex = parentIndex;
    }
  }

  bubbleDown(index) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (
        leftIndex < this.items.length &&
        compareNotificationsForHeap(
          this.items[leftIndex],
          this.items[smallestIndex],
        ) < 0
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < this.items.length &&
        compareNotificationsForHeap(
          this.items[rightIndex],
          this.items[smallestIndex],
        ) < 0
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) {
        break;
      }

      [this.items[currentIndex], this.items[smallestIndex]] = [
        this.items[smallestIndex],
        this.items[currentIndex],
      ];
      currentIndex = smallestIndex;
    }
  }
}

export function selectTopNotifications(
  notifications,
  limit = 10,
  options = {},
) {
  const { unreadOnly = true } = options;
  const heap = new NotificationMinHeap();

  for (const notification of notifications) {
    if (unreadOnly && notification.isRead) {
      continue;
    }

    if (heap.size() < limit) {
      heap.push(notification);
      continue;
    }

    const currentLowest = heap.peek();
    if (
      compareNotificationsForDisplay(notification, currentLowest) < 0
    ) {
      continue;
    }

    heap.replaceTop(notification);
  }

  return heap.toArray().sort(compareNotificationsForDisplay);
}
