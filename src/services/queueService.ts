import { QueueMessage, ChannelType, PriorityType, MessageStatus } from '../types';
import { queueRepo } from '../database/store';

const RETRY_DELAYS = [1000, 5000, 15000, 30000];

export class QueueService {
  enqueue(data: {
    template_id: string;
    user_id?: string;
    recipient?: string;
    channel: ChannelType;
    priority?: PriorityType;
    params?: Record<string, any>;
    scheduled_at?: number;
    max_retries?: number;
    language: string;
    app_id?: string;
    rendered_subject?: string;
    rendered_content?: string;
  }): QueueMessage {
    return queueRepo.enqueue(data);
  }

  getMessage(id: string): QueueMessage | undefined {
    return queueRepo.get(id);
  }

  getNextMessages(channel?: ChannelType, limit: number = 10): QueueMessage[] {
    return queueRepo.getNext(channel, limit);
  }

  updateStatus(id: string, status: MessageStatus, errorMessage?: string): void {
    queueRepo.updateStatus(id, status, errorMessage);
  }

  incrementRetry(id: string, errorMessage: string): boolean {
    const msg = this.getMessage(id);
    if (!msg) return false;
    const delay = RETRY_DELAYS[Math.min(msg.retry_count, RETRY_DELAYS.length - 1)];
    return queueRepo.incrementRetry(id, errorMessage, delay);
  }

  getStats() {
    return queueRepo.stats();
  }

  removeMessage(id: string): boolean {
    return queueRepo.remove(id);
  }

  listMessages(params?: {
    status?: MessageStatus;
    channel?: ChannelType;
    page?: number;
    pageSize?: number;
  }): { items: QueueMessage[]; total: number } {
    return queueRepo.list(params);
  }
}

export const queueService = new QueueService();
