import { Router, Request, Response } from 'express';
import { templateService } from '../services/templateService';
import { ChannelType } from '../types';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, category, priority } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const template = templateService.createTemplate({ name, description, category, priority });
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { category, status, page, pageSize } = req.query;
    const result = templateService.listTemplates({
      category: category as string | undefined,
      status: status as string | undefined,
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
    const template = templateService.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const template = templateService.updateTemplate(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/publish', (req: Request, res: Response) => {
  try {
    const template = templateService.publishTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/unpublish', (req: Request, res: Response) => {
  try {
    const template = templateService.unpublishTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/new-version', (req: Request, res: Response) => {
  try {
    const template = templateService.newVersion(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/rollback', (req: Request, res: Response) => {
  try {
    const { version } = req.body;
    if (!version) {
      return res.status(400).json({ error: 'version is required' });
    }
    const template = templateService.rollbackVersion(req.params.id, version);
    if (!template) {
      return res.status(400).json({ error: 'Template not found or version does not exist' });
    }
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/versions', (req: Request, res: Response) => {
  try {
    const versions = templateService.getVersions(req.params.id);
    res.json(versions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const success = templateService.deleteTemplate(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/contents', (req: Request, res: Response) => {
  try {
    const { language, channel, subject, content } = req.body;
    if (!language || !channel || !content) {
      return res.status(400).json({ error: 'language, channel and content are required' });
    }
    const templateContent = templateService.addTemplateContent({
      template_id: req.params.id,
      language,
      channel: channel as ChannelType,
      subject,
      content
    });
    res.json(templateContent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/contents', (req: Request, res: Response) => {
  try {
    const { version } = req.query;
    const contents = templateService.getTemplateContents(
      req.params.id,
      version ? parseInt(version as string) : undefined
    );
    res.json(contents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/render', (req: Request, res: Response) => {
  try {
    const { language, channel, params, version } = req.body;
    if (!language || !channel) {
      return res.status(400).json({ error: 'language and channel are required' });
    }
    const result = templateService.renderTemplate(
      req.params.id,
      language,
      channel as ChannelType,
      params || {},
      version
    );
    if (!result) {
      return res.status(404).json({ error: 'Template content not found' });
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
