import { Router, Request, Response } from 'express';
import { appRepo, auditLogRepo } from '../database/store';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, ip_whitelist } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const app = appRepo.create({ name, description, ip_whitelist });
    res.json(app);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { page, pageSize } = req.query;
    const result = appRepo.list({
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/audit-logs/overview', (req: Request, res: Response) => {
  try {
    const { start_time, end_time } = req.query;
    const stats = auditLogRepo.statsByApp({
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined
    });
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const app = appRepo.get(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }
    const { secret, ...safe } = app;
    res.json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, description, enabled, ip_whitelist } = req.body;
    const app = appRepo.update(req.params.id, { name, description, enabled, ip_whitelist });
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }
    res.json(app);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/regenerate-secret', (req: Request, res: Response) => {
  try {
    const app = appRepo.regenerateSecret(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }
    res.json(app);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const success = appRepo.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'App not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/audit-logs', (req: Request, res: Response) => {
  try {
    const { action, status, start_time, end_time, page, pageSize } = req.query;
    const result = auditLogRepo.list({
      app_id: req.params.id,
      action: action as string | undefined,
      status: status as any,
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/audit-stats', (req: Request, res: Response) => {
  try {
    const { start_time, end_time } = req.query;
    const allStats = auditLogRepo.statsByApp({
      start_time: start_time ? parseInt(start_time as string) : undefined,
      end_time: end_time ? parseInt(end_time as string) : undefined
    });
    const appStats = allStats.find(s => s.app_id === req.params.id);
    res.json(appStats || { app_id: req.params.id, total_calls: 0, success: 0, auth_failed: 0, ip_blocked: 0, errors: 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
