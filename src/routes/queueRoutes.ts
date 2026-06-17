import { Router, Request, Response } from 'express';
import { queueService } from '../services/queueService';
import { ChannelType, MessageStatus } from '../types';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { status, channel, page, pageSize } = req.query;
    const result = queueService.listMessages({
      status: status as MessageStatus | undefined,
      channel: channel as ChannelType | undefined,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = queueService.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const msg = queueService.getMessage(req.params.id);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json(msg);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const success = queueService.removeMessage(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
