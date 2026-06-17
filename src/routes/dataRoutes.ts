import { Router, Request, Response } from 'express';
import { dataManagementRepo } from '../database/store';
import { DataTag } from '../types';

const router = Router();

router.get('/summary', (req: Request, res: Response) => {
  try {
    const summary = dataManagementRepo.getSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tag', (req: Request, res: Response) => {
  try {
    const tag = dataManagementRepo.getTag();
    res.json({ data_tag: tag });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/tag', (req: Request, res: Response) => {
  try {
    const { data_tag } = req.body;
    if (!['production', 'demo', 'test'].includes(data_tag)) {
      return res.status(400).json({ error: 'data_tag must be production, demo, or test' });
    }
    dataManagementRepo.setTag(data_tag as DataTag);
    res.json({ data_tag });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/clear', (req: Request, res: Response) => {
  try {
    const { tag } = req.body;
    if (!tag) {
      return res.status(400).json({ error: 'tag is required (production, demo, or test)' });
    }
    if (!['demo', 'test'].includes(tag)) {
      return res.status(400).json({ error: 'Only demo or test data can be cleared' });
    }
    const result = dataManagementRepo.clearByTag(tag as DataTag);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/clear-all', (req: Request, res: Response) => {
  try {
    const result = dataManagementRepo.clearAll();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/export', (req: Request, res: Response) => {
  try {
    const backup = dataManagementRepo.exportBackup();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=push-center-backup-${Date.now()}.json`);
    res.json(backup);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', (req: Request, res: Response) => {
  try {
    const result = dataManagementRepo.importBackup(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
