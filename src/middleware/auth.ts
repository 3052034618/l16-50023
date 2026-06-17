import { Request, Response, NextFunction } from 'express';
import { appRepo } from '../database/store';

declare global {
  namespace Express {
    interface Request {
      appClient?: { id: string; name: string };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const appId = req.headers['x-app-id'] as string;
  const appSecret = req.headers['x-app-secret'] as string;

  if (!appId || !appSecret) {
    return res.status(401).json({ error: 'Missing x-app-id or x-app-secret header' });
  }

  const app = appRepo.authenticate(appId, appSecret);
  if (!app) {
    return res.status(401).json({ error: 'Invalid app credentials' });
  }

  req.appClient = { id: app.id, name: app.name };
  next();
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const appId = req.headers['x-app-id'] as string;
  const appSecret = req.headers['x-app-secret'] as string;

  if (appId && appSecret) {
    const app = appRepo.authenticate(appId, appSecret);
    if (app) {
      req.appClient = { id: app.id, name: app.name };
    }
  }

  next();
}
