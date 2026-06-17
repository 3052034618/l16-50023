import { Router, Request, Response } from 'express';
import { historyService } from '../services/historyService';
import { ChannelType, MessageStatus } from '../types';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { channel, status, template_id, user_id, start_time, end_time, app_id, page, pageSize } = req.query;
    const result = historyService.list({
      channel: channel as ChannelType | undefined,
      status: status as MessageStatus | undefined,
      template_id: template_id as string | undefined,
      user_id: user_id as string | undefined,
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined,
      app_id: app_id as string | undefined,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/delivery', (req: Request, res: Response) => {
  try {
    const { channel, template_id, start_time, end_time, app_id } = req.query;
    const stats = historyService.getDeliveryStats({
      channel: channel as ChannelType | undefined,
      template_id: template_id as string | undefined,
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined,
      app_id: app_id as string | undefined
    });
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/by-channel', (req: Request, res: Response) => {
  try {
    const { start_time, end_time, app_id } = req.query;
    const stats = historyService.getStatsByChannel({
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined,
      app_id: app_id as string | undefined
    });
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/by-template', (req: Request, res: Response) => {
  try {
    const { start_time, end_time, app_id, limit } = req.query;
    const stats = historyService.getStatsByTemplate({
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined,
      app_id: app_id as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined
    });
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/by-app', (req: Request, res: Response) => {
  try {
    const { start_time, end_time, limit } = req.query;
    const stats = historyService.getStatsByApp({
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined
    });
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/failure-reasons', (req: Request, res: Response) => {
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

router.get('/:id', (req: Request, res: Response) => {
  try {
    const record = historyService.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
