import { SendHistory, ChannelType, MessageStatus, DeliveryStats, FailureReasonEntry } from '../types';
import { historyRepo } from '../database/store';

export class HistoryService {
  record(history: Omit<SendHistory, 'id' | 'created_at'> & { id?: string; created_at?: number }): SendHistory {
    return historyRepo.record(history);
  }

  get(id: string): SendHistory | undefined {
    return historyRepo.get(id);
  }

  list(params?: {
    channel?: ChannelType;
    status?: MessageStatus;
    template_id?: string;
    user_id?: string;
    start_time?: number;
    end_time?: number;
    app_id?: string;
    page?: number;
    pageSize?: number;
  }): { items: SendHistory[]; total: number } {
    return historyRepo.list(params);
  }

  getDeliveryStats(params?: {
    channel?: ChannelType;
    template_id?: string;
    start_time?: number;
    end_time?: number;
    app_id?: string;
  }): DeliveryStats {
    return historyRepo.deliveryStats(params);
  }

  getStatsByChannel(params?: {
    start_time?: number;
    end_time?: number;
    app_id?: string;
  }): { channel: ChannelType; stats: DeliveryStats }[] {
    return historyRepo.statsByChannel(params);
  }

  getStatsByTemplate(params?: {
    start_time?: number;
    end_time?: number;
    app_id?: string;
    limit?: number;
  }): { template_id: string; template_name: string; stats: DeliveryStats }[] {
    return historyRepo.statsByTemplate(params);
  }

  getStatsByApp(params?: {
    start_time?: number;
    end_time?: number;
    limit?: number;
  }): { app_id: string; stats: DeliveryStats }[] {
    return historyRepo.statsByApp(params);
  }

  getFailureReasons(params?: {
    channel?: ChannelType;
    limit?: number;
  }): FailureReasonEntry[] {
    return historyRepo.failureReasons(params);
  }
}

export const historyService = new HistoryService();
