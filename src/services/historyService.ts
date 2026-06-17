import { SendHistory, ChannelType, MessageStatus, DeliveryStats } from '../types';
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
  }): DeliveryStats {
    return historyRepo.deliveryStats(params);
  }

  getStatsByChannel(params?: {
    start_time?: number;
    end_time?: number;
  }): { channel: ChannelType; stats: DeliveryStats }[] {
    return historyRepo.statsByChannel(params);
  }

  getStatsByTemplate(params?: {
    start_time?: number;
    end_time?: number;
    limit?: number;
  }): { template_id: string; template_name: string; stats: DeliveryStats }[] {
    return historyRepo.statsByTemplate(params);
  }
}

export const historyService = new HistoryService();
