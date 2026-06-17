import { Router, Request, Response } from 'express';
import { userService } from '../services/userService';
import { ChannelType } from '../types';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  try {
    const { id, name, email, phone, language } = req.body;
    const user = userService.createUser({ id, name, email, phone, language });
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { page, pageSize } = req.query;
    const result = userService.listUsers({
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
    const user = userService.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const user = userService.updateUser(req.params.id, req.body);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/preferences', (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const prefs = userService.getUserPreferences(
      req.params.id,
      category as string | undefined
    );
    res.json(prefs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/preferences/:category/:channel', (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const pref = userService.setPreference(
      req.params.id,
      req.params.category,
      req.params.channel as ChannelType,
      enabled === true || enabled === 1 || enabled === 'true'
    );
    res.json(pref);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
