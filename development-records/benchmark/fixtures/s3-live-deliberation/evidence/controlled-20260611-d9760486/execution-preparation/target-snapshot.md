## /tmp/s3-controlled-fixture/notification-batcher.ts

/**
 * Notification batcher: collects notifications per user and flushes them
 * as one digest when the batch window closes.
 */
export interface PendingNotification {
  userId: string;
  body: string;
  /** Epoch ms when the notification entered the batch. */
  enqueuedAt: number;
}

const WINDOW_MS = 30_000;

export class NotificationBatcher {
  private pending = new Map<string, PendingNotification[]>();
  private windowStartedAt: number | null = null;

  /** Adds a notification. Starts the window on first enqueue. */
  enqueue(item: PendingNotification): void {
    if (this.windowStartedAt === null) this.windowStartedAt = Date.now();
    const list = this.pending.get(item.userId) ?? [];
    list.push(item);
    this.pending.set(item.userId, list);
  }

  /**
   * Flushes when the window has closed. Returns one digest per user.
   * Callers poll this; an empty array means "window still open".
   */
  flush(now: number): Array<{ userId: string; digest: string }> {
    if (this.windowStartedAt === null) return [];
    if (now - this.windowStartedAt < WINDOW_MS) return [];
    const digests: Array<{ userId: string; digest: string }> = [];
    for (const [userId, items] of this.pending) {
      digests.push({ userId, digest: items.map((i) => i.body).join("\n") });
    }
    // Reset for the next window. Notifications enqueued between the
    // window close check and this reset are carried into the next window.
    this.pending.clear();
    this.windowStartedAt = null;
    return digests;
  }

  /** Number of users with pending notifications (monitoring metric). */
  pendingUserCount(): number {
    return this.pending.size;
  }
}
