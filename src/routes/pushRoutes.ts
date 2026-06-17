import { Router, Request, Response } from 'express';
import { pushService } from '../services/pushService';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { PushRequest } from '../types';

const router = Router();

router.post('/send', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const request = req.body as PushRequest;
    if (!request.template_id) {
      return res.status(400).json({ error: 'template_id is required' });
    }
    if (req.appClient) {
      request.app_id = req.appClient.id;
    }
    const result = await pushService.send(request);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/process-queue', async (req: Request, res: Response) => {
  try {
    const { channel, batch_size } = req.body;
    const count = await pushService.processQueue(channel, batch_size || 10);
    res.json({ processed: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
