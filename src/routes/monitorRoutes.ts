import { Router, Request, Response } from 'express';
import { alertService } from '../services/alertService';
import { queueService } from '../services/queueService';
import { historyService } from '../services/historyService';
import { channelManager } from '../channels/channelManager';
import { AlertLevel, ChannelType } from '../types';

const router = Router();

router.get('/overview', (req: Request, res: Response) => {
  try {
    const queueStats = queueService.getStats();
    const deliveryStats = historyService.getDeliveryStats();
    const activeAlerts = alertService.getActiveAlerts();
    const channels = channelManager.getChannels();

    const channelStats = channels.map(channel => {
      const queueStat = queueStats.byChannel.find(c => c.channel === channel);
      const historyStat = historyService.getDeliveryStats({ channel });
      return {
        channel,
        queue: {
          pending: queueStat?.pending || 0,
          sending: queueStat?.sending || 0,
          failed: queueStat?.failed || 0,
          total: queueStat?.total || 0
        },
        delivery: historyStat
      };
    });

    res.json({
      queue: {
        total: queueStats.total,
        pending: queueStats.pending,
        sending: queueStats.sending,
        failed: queueStats.failed
      },
      delivery: deliveryStats,
      active_alerts: activeAlerts,
      channels: channelStats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/queue/backlog', (req: Request, res: Response) => {
  try {
    const stats = queueService.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alerts', (req: Request, res: Response) => {
  try {
    const { level, resolved, type, channel, page, pageSize } = req.query;
    const result = alertService.listAlerts({
      level: level as AlertLevel | undefined,
      resolved: resolved !== undefined ? resolved === 'true' : undefined,
      type: type as string | undefined,
      channel: channel as ChannelType | undefined,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alerts/active', (req: Request, res: Response) => {
  try {
    const alerts = alertService.getActiveAlerts();
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/alerts/check', (req: Request, res: Response) => {
  try {
    const alerts = alertService.checkQueueBacklog();
    res.json({ triggered: alerts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/alerts/:id/resolve', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const success = alertService.resolveAlert(id);
    if (!success) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
