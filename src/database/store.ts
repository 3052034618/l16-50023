import { Template, TemplateContent, TemplateStatus, User, UserPreference, QueueMessage, SendHistory, Alert, AppClient, ChannelType, PriorityType, MessageStatus, AlertLevel, BacklogSnapshot, FailureReasonEntry, DeliveryStats, AuditLog, CircuitBreakerState, CircuitState, RateLimiterState, LatencyBucket, DataTag } from '../types';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

interface DataStore {
  data_tag: DataTag;
  templates: Template[];
  templateContents: TemplateContent[];
  users: User[];
  userPreferences: UserPreference[];
  messageQueue: QueueMessage[];
  sendHistory: SendHistory[];
  alerts: Alert[];
  apps: AppClient[];
  backlogSnapshots: BacklogSnapshot[];
  auditLogs: AuditLog[];
  latencyRecords: { channel: ChannelType; duration_ms: number; created_at: number }[];
}

let store: DataStore;
let dataFilePath: string | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let dirty = false;

function generateId(): string {
  return uuidv4();
}

function now(): number {
  return Date.now();
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) {
      saveToFile();
      dirty = false;
    }
  }, 2000);
}

function saveToFile() {
  if (!dataFilePath) return;
  try {
    const data = JSON.stringify(store, null, 2);
    fs.writeFileSync(dataFilePath, data, 'utf-8');
  } catch (e) {
    console.error('[Persistence] Failed to save:', (e as Error).message);
  }
}

function loadFromFile(): boolean {
  if (!dataFilePath || !fs.existsSync(dataFilePath)) return false;
  try {
    const raw = fs.readFileSync(dataFilePath, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      store.templates = Array.isArray(data.templates) ? data.templates : [];
      store.templateContents = Array.isArray(data.templateContents) ? data.templateContents : [];
      store.users = Array.isArray(data.users) ? data.users : [];
      store.userPreferences = Array.isArray(data.userPreferences) ? data.userPreferences : [];
      store.messageQueue = Array.isArray(data.messageQueue) ? data.messageQueue : [];
      store.sendHistory = Array.isArray(data.sendHistory) ? data.sendHistory : [];
      store.alerts = Array.isArray(data.alerts) ? data.alerts : [];
      store.apps = Array.isArray(data.apps) ? data.apps : [];
      store.backlogSnapshots = Array.isArray(data.backlogSnapshots) ? data.backlogSnapshots : [];
      store.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
      store.latencyRecords = Array.isArray(data.latencyRecords) ? data.latencyRecords : [];
      if (!store.data_tag) store.data_tag = 'production';
      for (const t of store.templates) {
        if (t.status === undefined) t.status = 'published';
        if (t.current_version === undefined) t.current_version = 1;
        if (t.published_version === undefined) {
          t.published_version = t.status === 'published' ? t.current_version : 0;
        }
      }
      for (const tc of store.templateContents) {
        if (tc.version === undefined) tc.version = 1;
      }
      for (const app of store.apps) {
        if (app.ip_whitelist === undefined) app.ip_whitelist = [];
      }
      const nextId = Math.max(
        store.templateContents.reduce((m, t) => Math.max(m, t.id || 0), 0),
        store.userPreferences.reduce((m, p) => Math.max(m, p.id || 0), 0),
        store.alerts.reduce((m, a) => Math.max(m, a.id || 0), 0),
        store.auditLogs.reduce((m, a) => Math.max(m, a.id || 0), 0)
      ) + 1;
      autoIdCounter = nextId;
      console.log(`[Persistence] Loaded data: ${store.templates.length} templates, ${store.users.length} users, ${store.sendHistory.length} history, ${store.apps.length} apps`);
      return true;
    }
  } catch (e) {
    console.error('[Persistence] Failed to load:', (e as Error).message);
  }
  return false;
}

let autoIdCounter = 1;
function nextAutoId(): number {
  return autoIdCounter++;
}

export function initDatabase(dbPath?: string): DataStore {
  store = {
    data_tag: 'production',
    templates: [],
    templateContents: [],
    users: [],
    userPreferences: [],
    messageQueue: [],
    sendHistory: [],
    alerts: [],
    apps: [],
    backlogSnapshots: [],
    auditLogs: [],
    latencyRecords: []
  };

  if (dbPath === ':memory:') {
    dataFilePath = null;
    console.log('[Persistence] Running in memory mode, no persistence');
  } else if (dbPath) {
    dataFilePath = dbPath;
    const loaded = loadFromFile();
    if (!loaded) {
      console.log('[Persistence] No existing data, starting fresh');
    }
  } else {
    dataFilePath = path.join(process.cwd(), 'push-center-data.json');
    const loaded = loadFromFile();
    if (!loaded) {
      console.log('[Persistence] No existing data, starting fresh');
    }
  }

  return store;
}

export function getStore(): DataStore {
  if (!store) throw new Error('Database not initialized');
  return store;
}

export function flushToDisk() {
  if (dirty) {
    saveToFile();
    dirty = false;
  }
}

export const templateRepo = {
  create(data: { name: string; description?: string; category?: string; priority?: string }): Template {
    const t: Template = {
      id: generateId(), name: data.name, description: data.description,
      category: data.category || 'general', priority: (data.priority || 'normal') as PriorityType,
      status: 'draft' as TemplateStatus, current_version: 1, published_version: 0,
      created_at: now(), updated_at: now()
    };
    getStore().templates.push(t);
    scheduleSave();
    return t;
  },
  get(id: string): Template | undefined {
    return getStore().templates.find(t => t.id === id);
  },
  list(params?: { category?: string; status?: TemplateStatus; page?: number; pageSize?: number }): { items: Template[]; total: number } {
    let items = [...getStore().templates];
    if (params?.category) items = items.filter(t => t.category === params.category);
    if (params?.status) items = items.filter(t => t.status === params.status);
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total };
  },
  update(id: string, data: { name?: string; description?: string; category?: string; priority?: string }): Template | undefined {
    const t = this.get(id);
    if (!t) return undefined;
    if (data.name !== undefined) t.name = data.name;
    if (data.description !== undefined) t.description = data.description;
    if (data.category !== undefined) t.category = data.category;
    if (data.priority !== undefined) t.priority = data.priority as PriorityType;
    t.updated_at = now();
    scheduleSave();
    return t;
  },
  publish(id: string): Template | undefined {
    const t = this.get(id);
    if (!t) return undefined;
    t.status = 'published';
    t.published_version = t.current_version;
    t.updated_at = now();
    scheduleSave();
    return t;
  },
  unpublish(id: string): Template | undefined {
    const t = this.get(id);
    if (!t) return undefined;
    t.status = 'draft';
    t.updated_at = now();
    scheduleSave();
    return t;
  },
  newVersion(id: string): Template | undefined {
    const t = this.get(id);
    if (!t) return undefined;
    t.current_version += 1;
    t.updated_at = now();
    return t;
  },
  rollback(id: string, targetVersion: number): Template | undefined {
    const t = this.get(id);
    if (!t) return undefined;
    const versions = templateContentRepo.getVersions(id);
    if (!versions.includes(targetVersion)) return undefined;
    t.published_version = targetVersion;
    t.current_version = targetVersion;
    t.status = 'published';
    t.updated_at = now();
    scheduleSave();
    return t;
  },
  delete(id: string): boolean {
    const idx = getStore().templates.findIndex(t => t.id === id);
    if (idx === -1) return false;
    getStore().templates.splice(idx, 1);
    scheduleSave();
    return true;
  }
};

export const templateContentRepo = {
  upsert(data: { template_id: string; language: string; channel: ChannelType; subject?: string; content: string; version?: number }): TemplateContent {
    const tpl = templateRepo.get(data.template_id);
    const ver = data.version ?? (tpl ? tpl.current_version : 1);
    const existing = getStore().templateContents.find(
      tc => tc.template_id === data.template_id && tc.language === data.language && tc.channel === data.channel && tc.version === ver
    );
    if (existing) {
      if (data.subject !== undefined) existing.subject = data.subject;
      existing.content = data.content;
      existing.updated_at = now();
      scheduleSave();
      return existing;
    }
    const tc: TemplateContent = {
      id: nextAutoId(), template_id: data.template_id, language: data.language,
      channel: data.channel, subject: data.subject, content: data.content, version: ver,
      created_at: now(), updated_at: now()
    };
    getStore().templateContents.push(tc);
    scheduleSave();
    return tc;
  },
  get(template_id: string, language: string, channel: ChannelType, version?: number): TemplateContent | undefined {
    const tpl = templateRepo.get(template_id);
    const ver = version ?? (tpl ? tpl.current_version : undefined);
    if (ver !== undefined) {
      return getStore().templateContents.find(
        tc => tc.template_id === template_id && tc.language === language && tc.channel === channel && tc.version === ver
      );
    }
    return getStore().templateContents.find(
      tc => tc.template_id === template_id && tc.language === language && tc.channel === channel
    );
  },
  listByTemplate(template_id: string, version?: number): TemplateContent[] {
    let items = getStore().templateContents.filter(tc => tc.template_id === template_id);
    if (version !== undefined) items = items.filter(tc => tc.version === version);
    return items.sort((a, b) => a.language.localeCompare(b.language) || a.channel.localeCompare(b.channel));
  },
  getVersions(template_id: string): number[] {
    const versions = new Set(getStore().templateContents.filter(tc => tc.template_id === template_id).map(tc => tc.version));
    return Array.from(versions).sort((a, b) => b - a);
  },
  delete(id: number): boolean {
    const idx = getStore().templateContents.findIndex(tc => tc.id === id);
    if (idx === -1) return false;
    getStore().templateContents.splice(idx, 1);
    scheduleSave();
    return true;
  },
  findBestMatch(template_id: string, language: string, channel: ChannelType, version?: number): TemplateContent | undefined {
    const all = getStore().templateContents.filter(tc => tc.template_id === template_id && tc.channel === channel);
    if (all.length === 0) return undefined;

    let versions: number[];
    if (version !== undefined) {
      versions = all
        .filter(tc => tc.version <= version)
        .map(tc => tc.version)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .sort((a, b) => b - a);
    } else {
      versions = all
        .map(tc => tc.version)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .sort((a, b) => b - a);
    }

    for (const ver of versions) {
      const verContents = all.filter(tc => tc.version === ver);
      const exact = verContents.find(tc => tc.language === language);
      if (exact) return exact;
    }

    return undefined;
  }
};

export const userRepo = {
  create(data: { id?: string; name?: string; email?: string; phone?: string; language?: string }): User {
    const u: User = {
      id: data.id || generateId(), name: data.name, email: data.email,
      phone: data.phone, language: data.language || 'zh-CN', created_at: now()
    };
    getStore().users.push(u);
    scheduleSave();
    return u;
  },
  get(id: string): User | undefined {
    return getStore().users.find(u => u.id === id);
  },
  getByEmail(email: string): User | undefined {
    return getStore().users.find(u => u.email === email);
  },
  list(params?: { page?: number; pageSize?: number }): { items: User[]; total: number } {
    let items = [...getStore().users].sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total };
  },
  update(id: string, data: { name?: string; email?: string; phone?: string; language?: string }): User | undefined {
    const u = this.get(id);
    if (!u) return undefined;
    if (data.name !== undefined) u.name = data.name;
    if (data.email !== undefined) u.email = data.email;
    if (data.phone !== undefined) u.phone = data.phone;
    if (data.language !== undefined) u.language = data.language;
    scheduleSave();
    return u;
  },
  delete(id: string): boolean {
    const idx = getStore().users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    getStore().users.splice(idx, 1);
    scheduleSave();
    return true;
  }
};

export const userPreferenceRepo = {
  set(userId: string, category: string, channel: ChannelType, enabled: boolean): UserPreference {
    const existing = getStore().userPreferences.find(
      p => p.user_id === userId && p.category === category && p.channel === channel
    );
    if (existing) {
      existing.enabled = enabled;
      existing.updated_at = now();
      scheduleSave();
      return existing;
    }
    const p: UserPreference = {
      id: nextAutoId(), user_id: userId, category, channel, enabled, updated_at: now()
    };
    getStore().userPreferences.push(p);
    scheduleSave();
    return p;
  },
  bulkSet(userId: string, prefs: { category: string; channel: ChannelType; enabled: boolean }[]): void {
    for (const p of prefs) this.set(userId, p.category, p.channel, p.enabled);
  },
  get(userId: string, category?: string): UserPreference[] {
    let items = getStore().userPreferences.filter(p => p.user_id === userId);
    if (category) items = items.filter(p => p.category === category);
    return items.sort((a, b) => a.category.localeCompare(b.category) || a.channel.localeCompare(b.channel));
  },
  isEnabled(userId: string, category: string, channel: ChannelType): boolean | undefined {
    const p = getStore().userPreferences.find(
      p => p.user_id === userId && p.category === category && p.channel === channel
    );
    return p?.enabled;
  }
};

export const queueRepo = {
  enqueue(data: {
    template_id: string; user_id?: string; recipient?: string; channel: ChannelType;
    priority?: PriorityType; params?: Record<string, any>; scheduled_at?: number;
    max_retries?: number; language: string; app_id?: string;
    rendered_subject?: string; rendered_content?: string; template_version?: number;
  }): QueueMessage {
    const msg: QueueMessage = {
      id: generateId(), template_id: data.template_id, user_id: data.user_id,
      recipient: data.recipient, channel: data.channel,
      priority: data.priority || 'normal', status: 'pending',
      retry_count: 0, max_retries: data.max_retries ?? 3,
      params: data.params, scheduled_at: data.scheduled_at || now(),
      created_at: now(), language: data.language, app_id: data.app_id,
      rendered_subject: data.rendered_subject, rendered_content: data.rendered_content,
      template_version: data.template_version
    };
    getStore().messageQueue.push(msg);
    scheduleSave();
    return msg;
  },
  get(id: string): QueueMessage | undefined {
    return getStore().messageQueue.find(m => m.id === id);
  },
  getNext(channel?: ChannelType, limit: number = 10): QueueMessage[] {
    const nowTime = now();
    let items = getStore().messageQueue.filter(m => m.status === 'pending' && m.scheduled_at <= nowTime);
    if (channel) items = items.filter(m => m.channel === channel);
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    items.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2) || a.scheduled_at - b.scheduled_at);
    return items.slice(0, limit);
  },
  updateStatus(id: string, status: MessageStatus, errorMessage?: string): void {
    const msg = this.get(id);
    if (!msg) return;
    msg.status = status;
    if (status === 'sent' || status === 'delivered') {
      msg.sent_at = now();
      if (status === 'delivered') msg.delivered_at = now();
    }
    if (errorMessage) msg.error_message = errorMessage;
    scheduleSave();
  },
  cancel(id: string): QueueMessage | undefined {
    const msg = this.get(id);
    if (!msg) return undefined;
    if (msg.status !== 'pending') return undefined;
    msg.status = 'cancelled';
    msg.error_message = 'cancelled by user';
    msg.sent_at = now();
    scheduleSave();

    const tpl = templateRepo.get(msg.template_id);
    historyRepo.record({
      id: msg.id,
      template_id: msg.template_id,
      template_name: tpl?.name || 'Unknown',
      user_id: msg.user_id,
      recipient: msg.recipient,
      channel: msg.channel,
      priority: msg.priority,
      status: 'cancelled',
      language: msg.language,
      subject: msg.rendered_subject,
      content: msg.rendered_content || '',
      params: msg.params,
      retry_count: msg.retry_count,
      created_at: msg.created_at,
      sent_at: msg.sent_at,
      app_id: msg.app_id,
      error_message: 'cancelled by user'
    });

    return msg;
  },
  reschedule(id: string, scheduled_at: number): QueueMessage | undefined {
    const msg = this.get(id);
    if (!msg) return undefined;
    if (msg.status !== 'pending') return undefined;
    msg.scheduled_at = scheduled_at;
    scheduleSave();
    return msg;
  },
  updateContent(id: string, data: { rendered_subject?: string; rendered_content?: string }): QueueMessage | undefined {
    const msg = this.get(id);
    if (!msg) return undefined;
    if (msg.status !== 'pending') return undefined;
    if (data.rendered_subject !== undefined) msg.rendered_subject = data.rendered_subject;
    if (data.rendered_content !== undefined) msg.rendered_content = data.rendered_content;
    scheduleSave();
    return msg;
  },
  incrementRetry(id: string, errorMessage: string, retryDelay: number): boolean {
    const msg = this.get(id);
    if (!msg) return false;
    msg.retry_count += 1;
    msg.error_message = errorMessage;
    const shouldRetry = msg.retry_count < msg.max_retries;
    if (shouldRetry) { msg.status = 'pending'; msg.scheduled_at = now() + retryDelay; }
    else { msg.status = 'failed'; }
    scheduleSave();
    return shouldRetry;
  },
  remove(id: string): boolean {
    const idx = getStore().messageQueue.findIndex(m => m.id === id);
    if (idx === -1) return false;
    getStore().messageQueue.splice(idx, 1);
    scheduleSave();
    return true;
  },
  stats(): {
    total: number; pending: number; sending: number; failed: number;
    byChannel: { channel: ChannelType; pending: number; sending: number; failed: number; total: number }[];
  } {
    const all = getStore().messageQueue;
    const channels: ChannelType[] = ['email', 'sms', 'inapp', 'webhook'];
    const byChannel = channels.map(channel => {
      const cm = all.filter(m => m.channel === channel);
      return {
        channel, pending: cm.filter(m => m.status === 'pending').length,
        sending: cm.filter(m => m.status === 'sending').length,
        failed: cm.filter(m => m.status === 'failed').length, total: cm.length
      };
    });
    return {
      total: all.length, pending: all.filter(m => m.status === 'pending').length,
      sending: all.filter(m => m.status === 'sending').length,
      failed: all.filter(m => m.status === 'failed').length, byChannel
    };
  },
  list(params?: {
    status?: MessageStatus; channel?: ChannelType; page?: number; pageSize?: number;
  }): { items: QueueMessage[]; total: number } {
    let items = [...getStore().messageQueue];
    if (params?.status) items = items.filter(m => m.status === params.status);
    if (params?.channel) items = items.filter(m => m.channel === params.channel);
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total };
  }
};

export const historyRepo = {
  record(data: Omit<SendHistory, 'id' | 'created_at'> & { id?: string; created_at?: number }): SendHistory {
    const record: SendHistory = {
      id: data.id || generateId(), template_id: data.template_id,
      template_name: data.template_name, user_id: data.user_id,
      recipient: data.recipient, channel: data.channel,
      priority: data.priority, status: data.status, language: data.language,
      subject: data.subject, content: data.content, params: data.params,
      retry_count: data.retry_count || 0, error_message: data.error_message,
      created_at: data.created_at || now(), sent_at: data.sent_at,
      delivered_at: data.delivered_at, duration_ms: data.duration_ms,
      app_id: data.app_id
    };
    getStore().sendHistory.push(record);
    scheduleSave();
    return record;
  },
  get(id: string): SendHistory | undefined {
    return getStore().sendHistory.find(h => h.id === id);
  },
  list(params?: {
    channel?: ChannelType; status?: MessageStatus; template_id?: string;
    user_id?: string; start_time?: number; end_time?: number;
    app_id?: string; page?: number; pageSize?: number;
  }): { items: SendHistory[]; total: number } {
    let items = [...getStore().sendHistory];
    if (params?.channel) items = items.filter(h => h.channel === params.channel);
    if (params?.status) items = items.filter(h => h.status === params.status);
    if (params?.template_id) items = items.filter(h => h.template_id === params.template_id);
    if (params?.user_id) items = items.filter(h => h.user_id === params.user_id);
    if (params?.start_time) items = items.filter(h => h.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(h => h.created_at <= params.end_time!);
    if (params?.app_id) items = items.filter(h => h.app_id === params.app_id);
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total };
  },
  deliveryStats(params?: {
    channel?: ChannelType; template_id?: string; start_time?: number;
    end_time?: number; app_id?: string;
  }): DeliveryStats {
    let items = getStore().sendHistory;
    if (params?.channel) items = items.filter(h => h.channel === params.channel);
    if (params?.template_id) items = items.filter(h => h.template_id === params.template_id);
    if (params?.start_time) items = items.filter(h => h.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(h => h.created_at <= params.end_time!);
    if (params?.app_id) items = items.filter(h => h.app_id === params.app_id);
    const total = items.length;
    const sent = items.filter(h => h.status === 'sent' || h.status === 'delivered').length;
    const delivered = items.filter(h => h.status === 'delivered').length;
    const failed = items.filter(h => h.status === 'failed').length;
    const cancelled = items.filter(h => h.status === 'cancelled').length;
    return { total, sent, delivered, failed, cancelled, delivery_rate: total > 0 ? delivered / total : 0, success_rate: total > 0 ? sent / total : 0, cancel_rate: total > 0 ? cancelled / total : 0 };
  },
  statsByChannel(params?: { start_time?: number; end_time?: number; app_id?: string; }): { channel: ChannelType; stats: DeliveryStats }[] {
    const channels: ChannelType[] = ['email', 'sms', 'inapp', 'webhook'];
    return channels.map(channel => ({ channel, stats: this.deliveryStats({ ...params, channel }) }));
  },
  statsByTemplate(params?: { start_time?: number; end_time?: number; app_id?: string; limit?: number; }): { template_id: string; template_name: string; stats: DeliveryStats }[] {
    const map = new Map<string, { template_id: string; template_name: string; total: number; sent: number; delivered: number; failed: number; cancelled: number }>();
    let items = getStore().sendHistory;
    if (params?.start_time) items = items.filter(h => h.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(h => h.created_at <= params.end_time!);
    if (params?.app_id) items = items.filter(h => h.app_id === params.app_id);
    for (const h of items) {
      if (!map.has(h.template_id)) map.set(h.template_id, { template_id: h.template_id, template_name: h.template_name, total: 0, sent: 0, delivered: 0, failed: 0, cancelled: 0 });
      const e = map.get(h.template_id)!;
      e.total++;
      if (h.status === 'sent' || h.status === 'delivered') e.sent++;
      if (h.status === 'delivered') e.delivered++;
      if (h.status === 'failed') e.failed++;
      if (h.status === 'cancelled') e.cancelled++;
    }
    let result = Array.from(map.values()).map(e => ({
      template_id: e.template_id, template_name: e.template_name,
      stats: { total: e.total, sent: e.sent, delivered: e.delivered, failed: e.failed, cancelled: e.cancelled,
        delivery_rate: e.total > 0 ? e.delivered / e.total : 0,
        success_rate: e.total > 0 ? e.sent / e.total : 0,
        cancel_rate: e.total > 0 ? e.cancelled / e.total : 0 }
    }));
    result.sort((a, b) => b.stats.total - a.stats.total);
    if (params?.limit) result = result.slice(0, params.limit);
    return result;
  },
  statsByApp(params?: { start_time?: number; end_time?: number; limit?: number; }): { app_id: string; stats: DeliveryStats }[] {
    const map = new Map<string, { app_id: string; total: number; sent: number; delivered: number; failed: number; cancelled: number }>();
    let items = getStore().sendHistory;
    if (params?.start_time) items = items.filter(h => h.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(h => h.created_at <= params.end_time!);
    for (const h of items) {
      const aid = h.app_id || '_unknown';
      if (!map.has(aid)) map.set(aid, { app_id: aid, total: 0, sent: 0, delivered: 0, failed: 0, cancelled: 0 });
      const e = map.get(aid)!;
      e.total++;
      if (h.status === 'sent' || h.status === 'delivered') e.sent++;
      if (h.status === 'delivered') e.delivered++;
      if (h.status === 'failed') e.failed++;
      if (h.status === 'cancelled') e.cancelled++;
    }
    let result = Array.from(map.values()).map(e => ({
      app_id: e.app_id,
      stats: { total: e.total, sent: e.sent, delivered: e.delivered, failed: e.failed, cancelled: e.cancelled,
        delivery_rate: e.total > 0 ? e.delivered / e.total : 0,
        success_rate: e.total > 0 ? e.sent / e.total : 0,
        cancel_rate: e.total > 0 ? e.cancelled / e.total : 0 }
    }));
    result.sort((a, b) => b.stats.total - a.stats.total);
    if (params?.limit) result = result.slice(0, params.limit);
    return result;
  },
  failureReasons(params?: { channel?: ChannelType; limit?: number; }): FailureReasonEntry[] {
    let items = getStore().sendHistory.filter(h => h.status === 'failed' && h.error_message);
    if (params?.channel) items = items.filter(h => h.channel === params.channel);
    const map = new Map<string, { error: string; count: number; latest_at: number; channel: ChannelType }>();
    for (const h of items) {
      const key = `${h.channel}::${h.error_message}`;
      if (!map.has(key)) map.set(key, { error: h.error_message!, count: 0, latest_at: 0, channel: h.channel });
      const e = map.get(key)!;
      e.count++;
      if (h.created_at > e.latest_at) e.latest_at = h.created_at;
    }
    let result = Array.from(map.values()).sort((a, b) => b.count - a.count);
    if (params?.limit) result = result.slice(0, params.limit);
    return result;
  }
};

export const alertRepo = {
  create(data: { type: string; level: AlertLevel; message: string; channel?: ChannelType; details?: string; }): Alert {
    const alert: Alert = {
      id: nextAutoId(), type: data.type, level: data.level,
      message: data.message, channel: data.channel, details: data.details,
      resolved: false, created_at: now()
    };
    getStore().alerts.push(alert);
    scheduleSave();
    return alert;
  },
  resolve(id: number): boolean {
    const alert = getStore().alerts.find(a => a.id === id);
    if (!alert) return false;
    alert.resolved = true;
    alert.resolved_at = now();
    scheduleSave();
    return true;
  },
  autoResolveCheck(): number {
    const stats = queueRepo.stats();
    let resolved = 0;
    const activeBacklogAlerts = getStore().alerts.filter(
      a => !a.resolved && (a.type === 'queue_backlog_global' || a.type === 'queue_backlog_channel')
    );
    for (const alert of activeBacklogAlerts) {
      let belowThreshold = false;
      if (alert.type === 'queue_backlog_global') {
        belowThreshold = stats.pending < 500;
      } else if (alert.channel) {
        const chStat = stats.byChannel.find(c => c.channel === alert.channel);
        if (chStat) {
          belowThreshold = chStat.pending < 100;
        }
      }
      if (belowThreshold) {
        alert.resolved = true;
        alert.resolved_at = now();
        resolved++;
      }
    }
    if (resolved > 0) scheduleSave();
    return resolved;
  },
  findActive(type: string, channel?: ChannelType): Alert | undefined {
    return getStore().alerts.find(
      a => a.type === type && !a.resolved && (channel === undefined || a.channel === channel)
    );
  },
  list(params?: {
    level?: AlertLevel; resolved?: boolean; type?: string; channel?: ChannelType;
    page?: number; pageSize?: number;
  }): { items: Alert[]; total: number } {
    let items = [...getStore().alerts];
    if (params?.level) items = items.filter(a => a.level === params.level);
    if (params?.resolved !== undefined) items = items.filter(a => a.resolved === params.resolved);
    if (params?.type) items = items.filter(a => a.type === params.type);
    if (params?.channel) items = items.filter(a => a.channel === params.channel);
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total };
  },
  getActive(): Alert[] {
    return getStore().alerts.filter(a => !a.resolved);
  }
};

export const appRepo = {
  create(data: { name: string; description?: string; ip_whitelist?: string[] }): AppClient {
    const app: AppClient = {
      id: generateId(), name: data.name, secret: generateId(),
      description: data.description, enabled: true,
      ip_whitelist: data.ip_whitelist || [],
      created_at: now(), updated_at: now()
    };
    getStore().apps.push(app);
    scheduleSave();
    return app;
  },
  get(id: string): AppClient | undefined {
    return getStore().apps.find(a => a.id === id);
  },
  authenticate(id: string, secret: string): AppClient | undefined {
    const app = getStore().apps.find(a => a.id === id && a.secret === secret && a.enabled);
    return app;
  },
  checkIp(appId: string, ip: string): boolean {
    const app = this.get(appId);
    if (!app) return false;
    if (!app.ip_whitelist || app.ip_whitelist.length === 0) return true;
    return app.ip_whitelist.includes(ip);
  },
  list(params?: { page?: number; pageSize?: number }): { items: AppClient[]; total: number } {
    let items = [...getStore().apps].sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total };
  },
  update(id: string, data: { name?: string; description?: string; enabled?: boolean; ip_whitelist?: string[] }): AppClient | undefined {
    const app = this.get(id);
    if (!app) return undefined;
    if (data.name !== undefined) app.name = data.name;
    if (data.description !== undefined) app.description = data.description;
    if (data.enabled !== undefined) app.enabled = data.enabled;
    if (data.ip_whitelist !== undefined) app.ip_whitelist = data.ip_whitelist;
    app.updated_at = now();
    scheduleSave();
    return app;
  },
  regenerateSecret(id: string): AppClient | undefined {
    const app = this.get(id);
    if (!app) return undefined;
    app.secret = generateId();
    app.updated_at = now();
    scheduleSave();
    return app;
  },
  delete(id: string): boolean {
    const idx = getStore().apps.findIndex(a => a.id === id);
    if (idx === -1) return false;
    getStore().apps.splice(idx, 1);
    scheduleSave();
    return true;
  }
};

export const auditLogRepo = {
  record(data: { app_id: string; action: string; endpoint: string; ip: string; status: AuditLog['status']; error_message?: string }): AuditLog {
    const log: AuditLog = {
      id: nextAutoId(), app_id: data.app_id, action: data.action,
      endpoint: data.endpoint, ip: data.ip, status: data.status,
      error_message: data.error_message, created_at: now()
    };
    getStore().auditLogs.push(log);
    const oneWeekAgo = now() - 7 * 24 * 60 * 60 * 1000;
    if (getStore().auditLogs.length > 10000) {
      getStore().auditLogs = getStore().auditLogs.filter(l => l.created_at > oneWeekAgo);
    }
    scheduleSave();
    return log;
  },
  list(params?: {
    app_id?: string; action?: string; status?: AuditLog['status'];
    start_time?: number; end_time?: number;
    page?: number; pageSize?: number;
  }): { items: AuditLog[]; total: number } {
    let items = [...getStore().auditLogs];
    if (params?.app_id) items = items.filter(l => l.app_id === params.app_id);
    if (params?.action) items = items.filter(l => l.action === params.action);
    if (params?.status) items = items.filter(l => l.status === params.status);
    if (params?.start_time) items = items.filter(l => l.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(l => l.created_at <= params.end_time!);
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total };
  },
  statsByApp(params?: { start_time?: number; end_time?: number }): {
    app_id: string; total_calls: number; success: number; auth_failed: number; ip_blocked: number; errors: number;
  }[] {
    const map = new Map<string, { app_id: string; total_calls: number; success: number; auth_failed: number; ip_blocked: number; errors: number }>();
    let items = getStore().auditLogs;
    if (params?.start_time) items = items.filter(l => l.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(l => l.created_at <= params.end_time!);
    for (const l of items) {
      if (!map.has(l.app_id)) map.set(l.app_id, { app_id: l.app_id, total_calls: 0, success: 0, auth_failed: 0, ip_blocked: 0, errors: 0 });
      const e = map.get(l.app_id)!;
      e.total_calls++;
      if (l.status === 'success') e.success++;
      else if (l.status === 'auth_failed') e.auth_failed++;
      else if (l.status === 'ip_blocked') e.ip_blocked++;
      else if (l.status === 'error') e.errors++;
    }
    return Array.from(map.values()).sort((a, b) => b.total_calls - a.total_calls);
  }
};

export const backlogSnapshotRepo = {
  capture(): BacklogSnapshot[] {
    const stats = queueRepo.stats();
    const ts = now();
    const snapshots: BacklogSnapshot[] = stats.byChannel.map(ch => ({
      timestamp: ts, channel: ch.channel, pending: ch.pending,
      sending: ch.sending, failed: ch.failed
    }));
    getStore().backlogSnapshots.push(...snapshots);
    const oneDayAgo = ts - 24 * 60 * 60 * 1000;
    getStore().backlogSnapshots = getStore().backlogSnapshots.filter(s => s.timestamp > oneDayAgo);
    scheduleSave();
    return snapshots;
  },
  getTrend(params?: { channel?: ChannelType; since?: number; }): BacklogSnapshot[] {
    let items = getStore().backlogSnapshots;
    if (params?.channel) items = items.filter(s => s.channel === params.channel);
    if (params?.since) items = items.filter(s => s.timestamp >= params.since!);
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }
};

export const latencyRepo = {
  record(channel: ChannelType, durationMs: number): void {
    getStore().latencyRecords.push({ channel, duration_ms: durationMs, created_at: now() });
    const oneDayAgo = now() - 24 * 60 * 60 * 1000;
    if (getStore().latencyRecords.length > 50000) {
      getStore().latencyRecords = getStore().latencyRecords.filter(r => r.created_at > oneDayAgo);
    }
    scheduleSave();
  },
  getDistribution(params?: { channel?: ChannelType; since?: number }): LatencyBucket[] {
    const channels: ChannelType[] = params?.channel ? [params.channel] : ['email', 'sms', 'inapp', 'webhook'];
    let items = getStore().latencyRecords;
    if (params?.since) items = items.filter(r => r.created_at >= params.since!);
    return channels.map(channel => {
      const durations = items.filter(r => r.channel === channel).map(r => r.duration_ms).sort((a, b) => a - b);
      const count = durations.length;
      if (count === 0) {
        return { channel, p50: 0, p90: 0, p99: 0, max: 0, avg: 0, count: 0 };
      }
      const percentile = (arr: number[], p: number) => arr[Math.min(Math.floor(arr.length * p), arr.length - 1)];
      const sum = durations.reduce((a, b) => a + b, 0);
      return {
        channel,
        p50: percentile(durations, 0.5),
        p90: percentile(durations, 0.9),
        p99: percentile(durations, 0.99),
        max: durations[durations.length - 1],
        avg: Math.round(sum / count),
        count
      };
    });
  }
};

const circuitBreakers = new Map<ChannelType, CircuitBreakerState>();
const rateLimiters = new Map<ChannelType, RateLimiterState>();

const defaultCircuitConfig: Record<ChannelType, { threshold: number; reset_timeout_ms: number }> = {
  email: { threshold: 5, reset_timeout_ms: 30000 },
  sms: { threshold: 5, reset_timeout_ms: 30000 },
  inapp: { threshold: 5, reset_timeout_ms: 30000 },
  webhook: { threshold: 5, reset_timeout_ms: 30000 }
};

const defaultRateLimitConfig: Record<ChannelType, number> = {
  email: 100,
  sms: 50,
  inapp: 200,
  webhook: 100
};

function initCircuitBreaker(channel: ChannelType): CircuitBreakerState {
  if (!circuitBreakers.has(channel)) {
    circuitBreakers.set(channel, {
      channel,
      state: 'closed',
      failure_count: 0,
      success_count: 0,
      last_state_change_at: now(),
      half_open_attempts: 0,
      threshold: defaultCircuitConfig[channel].threshold,
      reset_timeout_ms: defaultCircuitConfig[channel].reset_timeout_ms
    });
  }
  return circuitBreakers.get(channel)!;
}

function initRateLimiter(channel: ChannelType): RateLimiterState {
  if (!rateLimiters.has(channel)) {
    rateLimiters.set(channel, {
      channel,
      max_rps: defaultRateLimitConfig[channel],
      current_tokens: defaultRateLimitConfig[channel],
      total_allowed: 0,
      total_rejected: 0,
      last_refill_at: now()
    });
  }
  return rateLimiters.get(channel)!;
}

export const channelRuntimeRepo = {
  getCircuitState(channel: ChannelType): CircuitBreakerState {
    return initCircuitBreaker(channel);
  },
  getAllCircuitStates(): CircuitBreakerState[] {
    const channels: ChannelType[] = ['email', 'sms', 'inapp', 'webhook'];
    return channels.map(ch => initCircuitBreaker(ch));
  },
  recordSuccess(channel: ChannelType): void {
    const cb = initCircuitBreaker(channel);
    cb.success_count++;
    if (cb.state === 'half_open') {
      cb.state = 'closed';
      cb.failure_count = 0;
      cb.last_state_change_at = now();
    }
  },
  recordFailure(channel: ChannelType): void {
    const cb = initCircuitBreaker(channel);
    cb.failure_count++;
    cb.last_failure_at = now();
    if (cb.state === 'half_open') {
      cb.state = 'open';
      cb.last_state_change_at = now();
    } else if (cb.state === 'closed' && cb.failure_count >= cb.threshold) {
      cb.state = 'open';
      cb.last_state_change_at = now();
    }
  },
  checkCircuit(channel: ChannelType): boolean {
    const cb = initCircuitBreaker(channel);
    if (cb.state === 'closed') return true;
    if (cb.state === 'open') {
      if (now() - cb.last_state_change_at >= cb.reset_timeout_ms) {
        cb.state = 'half_open';
        cb.half_open_attempts = 0;
        cb.last_state_change_at = now();
        return true;
      }
      return false;
    }
    if (cb.state === 'half_open') {
      cb.half_open_attempts++;
      return true;
    }
    return false;
  },
  resetCircuit(channel: ChannelType): void {
    const cb = initCircuitBreaker(channel);
    cb.state = 'closed';
    cb.failure_count = 0;
    cb.success_count = 0;
    cb.last_state_change_at = now();
  },
  acquireToken(channel: ChannelType): boolean {
    const rl = initRateLimiter(channel);
    const elapsed = now() - rl.last_refill_at;
    const refill = Math.floor(elapsed / 1000) * rl.max_rps;
    if (refill > 0) {
      rl.current_tokens = Math.min(rl.max_rps, rl.current_tokens + refill);
      rl.last_refill_at = now();
    }
    if (rl.current_tokens > 0) {
      rl.current_tokens--;
      rl.total_allowed++;
      return true;
    }
    rl.total_rejected++;
    return false;
  },
  getRateLimiterState(channel: ChannelType): RateLimiterState {
    return initRateLimiter(channel);
  },
  getAllRateLimiterStates(): RateLimiterState[] {
    const channels: ChannelType[] = ['email', 'sms', 'inapp', 'webhook'];
    return channels.map(ch => initRateLimiter(ch));
  }
};

export const dataManagementRepo = {
  getTag(): DataTag {
    return getStore().data_tag;
  },
  setTag(tag: DataTag): void {
    getStore().data_tag = tag;
    scheduleSave();
  },
  getSummary(): { data_tag: DataTag; templates: number; users: number; queue: number; history: number; alerts: number; apps: number; audit_logs: number } {
    const s = getStore();
    return {
      data_tag: s.data_tag,
      templates: s.templates.length,
      users: s.users.length,
      queue: s.messageQueue.length,
      history: s.sendHistory.length,
      alerts: s.alerts.length,
      apps: s.apps.length,
      audit_logs: s.auditLogs.length
    };
  },
  clearByTag(tag: DataTag): { cleared: string[] } {
    const s = getStore();
    const cleared: string[] = [];
    if (tag === 'test' || tag === 'demo') {
      s.messageQueue = [];
      s.sendHistory = [];
      s.alerts = [];
      s.backlogSnapshots = [];
      s.auditLogs = [];
      s.latencyRecords = [];
      cleared.push('messageQueue', 'sendHistory', 'alerts', 'backlogSnapshots', 'auditLogs', 'latencyRecords');
      if (tag === 'test') {
        s.templates = [];
        s.templateContents = [];
        s.users = [];
        s.userPreferences = [];
        s.apps = [];
        cleared.push('templates', 'templateContents', 'users', 'userPreferences', 'apps');
      }
    }
    s.data_tag = 'production';
    scheduleSave();
    saveToFile();
    return { cleared };
  },
  clearAll(): { cleared: string[] } {
    const s = getStore();
    s.templates = [];
    s.templateContents = [];
    s.users = [];
    s.userPreferences = [];
    s.messageQueue = [];
    s.sendHistory = [];
    s.alerts = [];
    s.apps = [];
    s.backlogSnapshots = [];
    s.auditLogs = [];
    s.latencyRecords = [];
    s.data_tag = 'production';
    scheduleSave();
    saveToFile();
    return { cleared: ['all'] };
  },
  exportBackup(): object {
    return JSON.parse(JSON.stringify(getStore()));
  },
  importBackup(data: any): { imported: string[] } {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup data');
    const s = getStore();
    const imported: string[] = [];
    const keys: (keyof DataStore)[] = ['data_tag', 'templates', 'templateContents', 'users', 'userPreferences', 'messageQueue', 'sendHistory', 'alerts', 'apps', 'backlogSnapshots', 'auditLogs', 'latencyRecords'];
    for (const key of keys) {
      if (Array.isArray(data[key]) || (key === 'data_tag' && typeof data[key] === 'string')) {
        (s as any)[key] = data[key];
        imported.push(key);
      }
    }
    const nextId = Math.max(
      s.templateContents.reduce((m, t) => Math.max(m, t.id || 0), 0),
      s.userPreferences.reduce((m, p) => Math.max(m, p.id || 0), 0),
      s.alerts.reduce((m, a) => Math.max(m, a.id || 0), 0),
      s.auditLogs.reduce((m, a) => Math.max(m, a.id || 0), 0)
    ) + 1;
    autoIdCounter = nextId;
    scheduleSave();
    saveToFile();
    return { imported };
  }
};

export const db = {
  init: initDatabase, templates: templateRepo, templateContents: templateContentRepo,
  users: userRepo, userPreferences: userPreferenceRepo, queue: queueRepo,
  history: historyRepo, alerts: alertRepo, apps: appRepo,
  backlogSnapshots: backlogSnapshotRepo, auditLogs: auditLogRepo,
  latency: latencyRepo, channelRuntime: channelRuntimeRepo, flush: flushToDisk
};

export default db;
