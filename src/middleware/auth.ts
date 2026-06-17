import { Request, Response, NextFunction } from 'express';
import { appRepo, auditLogRepo } from '../database/store';

declare global {
  namespace Express {
    interface Request {
      appClient?: { id: string; name: string };
    }
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const appId = req.headers['x-app-id'] as string;
  const appSecret = req.headers['x-app-secret'] as string;
  const clientIp = getClientIp(req);

  if (!appId || !appSecret) {
    auditLogRepo.record({
      app_id: appId || '_anonymous',
      action: req.method,
      endpoint: req.path,
      ip: clientIp,
      status: 'auth_failed',
      error_message: 'Missing x-app-id or x-app-secret header'
    });
    return res.status(401).json({ error: 'Missing x-app-id or x-app-secret header' });
  }

  const app = appRepo.authenticate(appId, appSecret);
  if (!app) {
    auditLogRepo.record({
      app_id: appId,
      action: req.method,
      endpoint: req.path,
      ip: clientIp,
      status: 'auth_failed',
      error_message: 'Invalid app credentials'
    });
    return res.status(401).json({ error: 'Invalid app credentials' });
  }

  if (!appRepo.checkIp(appId, clientIp)) {
    auditLogRepo.record({
      app_id: appId,
      action: req.method,
      endpoint: req.path,
      ip: clientIp,
      status: 'ip_blocked',
      error_message: `IP ${clientIp} not in whitelist`
    });
    return res.status(403).json({ error: 'IP address not allowed' });
  }

  auditLogRepo.record({
    app_id: appId,
    action: req.method,
    endpoint: req.path,
    ip: clientIp,
    status: 'success'
  });

  req.appClient = { id: app.id, name: app.name };
  next();
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const appId = req.headers['x-app-id'] as string;
  const appSecret = req.headers['x-app-secret'] as string;
  const clientIp = getClientIp(req);

  if (appId && appSecret) {
    const app = appRepo.authenticate(appId, appSecret);
    if (app) {
      if (!appRepo.checkIp(appId, clientIp)) {
        auditLogRepo.record({
          app_id: appId,
          action: req.method,
          endpoint: req.path,
          ip: clientIp,
          status: 'ip_blocked',
          error_message: `IP ${clientIp} not in whitelist`
        });
        return res.status(403).json({ error: 'IP address not allowed' });
      }

      auditLogRepo.record({
        app_id: appId,
        action: req.method,
        endpoint: req.path,
        ip: clientIp,
        status: 'success'
      });

      req.appClient = { id: app.id, name: app.name };
    } else {
      auditLogRepo.record({
        app_id: appId,
        action: req.method,
        endpoint: req.path,
        ip: clientIp,
        status: 'auth_failed',
        error_message: 'Invalid credentials'
      });
    }
  }

  next();
}
