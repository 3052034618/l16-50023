import { Alert, AlertLevel, ChannelType } from '../types';
import { alertRepo, backlogSnapshotRepo } from '../database/store';
import { queueService } from './queueService';

const QUEUE_THRESHOLDS: Record<ChannelType, { warning: number; critical: number }> = {
  email: { warning: 100, critical: 500 },
  sms: { warning: 50, critical: 200 },
  inapp: { warning: 200, critical: 1000 },
  webhook: { warning: 100, critical: 500 }
};

const GLOBAL_THRESHOLDS = { warning: 500, critical: 2000 };

export class AlertService {
  private checkInterval: NodeJS.Timeout | null = null;

  startMonitoring(intervalMs: number = 30000) {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => {
      this.checkQueueBacklog();
      alertRepo.autoResolveCheck();
      backlogSnapshotRepo.capture();
    }, intervalMs);
    console.log('[AlertService] Monitoring started');
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[AlertService] Monitoring stopped');
    }
  }

  checkQueueBacklog(): Alert[] {
    const alerts: Alert[] = [];
    const stats = queueService.getStats();

    if (stats.pending >= GLOBAL_THRESHOLDS.critical) {
      alerts.push(this.createAlert({
        type: 'queue_backlog_global', level: 'critical',
        message: `全局队列积压严重: ${stats.pending} 条待发送消息`,
        details: JSON.stringify({ pending: stats.pending, threshold: GLOBAL_THRESHOLDS.critical })
      }));
    } else if (stats.pending >= GLOBAL_THRESHOLDS.warning) {
      alerts.push(this.createAlert({
        type: 'queue_backlog_global', level: 'warning',
        message: `全局队列积压警告: ${stats.pending} 条待发送消息`,
        details: JSON.stringify({ pending: stats.pending, threshold: GLOBAL_THRESHOLDS.warning })
      }));
    }

    for (const channelStat of stats.byChannel) {
      const threshold = QUEUE_THRESHOLDS[channelStat.channel as ChannelType];
      if (!threshold) continue;

      if (channelStat.pending >= threshold.critical) {
        alerts.push(this.createAlert({
          type: 'queue_backlog_channel', level: 'critical',
          message: `${channelStat.channel} 渠道队列积压严重: ${channelStat.pending} 条`,
          channel: channelStat.channel as ChannelType,
          details: JSON.stringify({ pending: channelStat.pending, threshold: threshold.critical })
        }));
      } else if (channelStat.pending >= threshold.warning) {
        alerts.push(this.createAlert({
          type: 'queue_backlog_channel', level: 'warning',
          message: `${channelStat.channel} 渠道队列积压警告: ${channelStat.pending} 条`,
          channel: channelStat.channel as ChannelType,
          details: JSON.stringify({ pending: channelStat.pending, threshold: threshold.warning })
        }));
      }

      if (channelStat.failed >= threshold.warning) {
        alerts.push(this.createAlert({
          type: 'queue_failed_channel', level: 'warning',
          message: `${channelStat.channel} 渠道失败消息过多: ${channelStat.failed} 条`,
          channel: channelStat.channel as ChannelType,
          details: JSON.stringify({ failed: channelStat.failed, threshold: threshold.warning })
        }));
      }
    }

    return alerts;
  }

  createAlert(data: { type: string; level: AlertLevel; message: string; channel?: ChannelType; details?: string; }): Alert {
    const existing = alertRepo.findActive(data.type, data.channel);
    if (existing) {
      if (existing.level === data.level) return existing;
      if (existing.id !== undefined) this.resolveAlert(existing.id);
    }
    const alert = alertRepo.create(data);
    console.log(`[ALERT] [${data.level.toUpperCase()}] ${data.message}`);
    return alert;
  }

  resolveAlert(id: number): boolean {
    return alertRepo.resolve(id);
  }

  listAlerts(params?: {
    level?: AlertLevel; resolved?: boolean; type?: string; channel?: ChannelType;
    page?: number; pageSize?: number;
  }): { items: Alert[]; total: number } {
    return alertRepo.list(params);
  }

  getActiveAlerts(): Alert[] {
    return alertRepo.getActive();
  }

  getBacklogTrend(params?: { channel?: ChannelType; since?: number; }) {
    return backlogSnapshotRepo.getTrend(params);
  }

  runAutoResolve(): number {
    return alertRepo.autoResolveCheck();
  }
}

export const alertService = new AlertService();
