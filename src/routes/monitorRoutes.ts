import { Router, Request, Response } from 'express';
import { alertService } from '../services/alertService';
import { queueService } from '../services/queueService';
import { historyService } from '../services/historyService';
import { channelManager } from '../channels/channelManager';
import { backlogSnapshotRepo, channelRuntimeRepo, latencyRepo, auditLogRepo } from '../database/store';
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
      const circuitState = channelRuntimeRepo.getCircuitState(channel);
      const rateLimiterState = channelRuntimeRepo.getRateLimiterState(channel);
      return {
        channel,
        queue: {
          pending: queueStat?.pending || 0,
          sending: queueStat?.sending || 0,
          failed: queueStat?.failed || 0,
          total: queueStat?.total || 0
        },
        delivery: historyStat,
        circuit_breaker: {
          state: circuitState.state,
          failure_count: circuitState.failure_count,
          threshold: circuitState.threshold
        },
        rate_limiter: {
          max_rps: rateLimiterState.max_rps,
          total_allowed: rateLimiterState.total_allowed,
          total_rejected: rateLimiterState.total_rejected
        }
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

router.get('/queue/backlog-trend', (req: Request, res: Response) => {
  try {
    const { channel, since } = req.query;
    const trend = alertService.getBacklogTrend({
      channel: channel as ChannelType | undefined,
      since: since ? parseInt(since as string) : undefined
    });
    res.json(trend);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/queue/capture-snapshot', (req: Request, res: Response) => {
  try {
    const snapshots = backlogSnapshotRepo.capture();
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/failure-reasons', (req: Request, res: Response) => {
  try {
    const { channel, limit } = req.query;
    const reasons = historyService.getFailureReasons({
      channel: channel as ChannelType | undefined,
      limit: limit ? parseInt(limit as string) : undefined
    });
    res.json(reasons);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/latency', (req: Request, res: Response) => {
  try {
    const { channel, since } = req.query;
    const distribution = latencyRepo.getDistribution({
      channel: channel as ChannelType | undefined,
      since: since ? parseInt(since as string) : undefined
    });
    res.json(distribution);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/circuit-breakers', (req: Request, res: Response) => {
  try {
    const states = channelRuntimeRepo.getAllCircuitStates();
    res.json(states);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/circuit-breakers/:channel', (req: Request, res: Response) => {
  try {
    const state = channelRuntimeRepo.getCircuitState(req.params.channel as ChannelType);
    res.json(state);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/circuit-breakers/:channel/reset', (req: Request, res: Response) => {
  try {
    channelRuntimeRepo.resetCircuit(req.params.channel as ChannelType);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rate-limiters', (req: Request, res: Response) => {
  try {
    const states = channelRuntimeRepo.getAllRateLimiterStates();
    res.json(states);
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

router.post('/alerts/auto-resolve', (req: Request, res: Response) => {
  try {
    const resolved = alertService.runAutoResolve();
    res.json({ resolved });
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
