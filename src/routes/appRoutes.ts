import { Router, Request, Response } from 'express';
import { appRepo } from '../database/store';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const app = appRepo.create({ name, description });
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
    const { name, description, enabled } = req.body;
    const app = appRepo.update(req.params.id, { name, description, enabled });
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

export default router;
