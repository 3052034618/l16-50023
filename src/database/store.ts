import { Template, TemplateContent, User, UserPreference, QueueMessage, SendHistory, Alert, ChannelType, PriorityType, MessageStatus, AlertLevel } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface DataStore {
  templates: Template[];
  templateContents: TemplateContent[];
  users: User[];
  userPreferences: UserPreference[];
  messageQueue: QueueMessage[];
  sendHistory: SendHistory[];
  alerts: Alert[];
}

let store: DataStore;

export function initDatabase(_dbPath?: string): DataStore {
  store = {
    templates: [],
    templateContents: [],
    users: [],
    userPreferences: [],
    messageQueue: [],
    sendHistory: [],
    alerts: []
  };
  return store;
}

export function getStore(): DataStore {
  if (!store) {
    throw new Error('Database not initialized');
  }
  return store;
}

function generateId(): string {
  return uuidv4();
}

function now(): number {
  return Date.now();
}

export const templateRepo = {
  create(data: {
    name: string;
    description?: string;
    category?: string;
    priority?: string;
  }): Template {
    const t: Template = {
      id: generateId(),
      name: data.name,
      description: data.description,
      category: data.category || 'general',
      priority: (data.priority || 'normal') as PriorityType,
      created_at: now(),
      updated_at: now()
    };
    getStore().templates.push(t);
    return t;
  },

  get(id: string): Template | undefined {
    return getStore().templates.find(t => t.id === id);
  },

  list(params?: { category?: string; page?: number; pageSize?: number }): {
    items: Template[];
    total: number;
  } {
    let items = [...getStore().templates];
    if (params?.category) {
      items = items.filter(t => t.category === params.category);
    }
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    items = items.slice(offset, offset + pageSize);

    return { items, total };
  },

  update(id: string, data: {
    name?: string;
    description?: string;
    category?: string;
    priority?: string;
  }): Template | undefined {
    const t = this.get(id);
    if (!t) return undefined;

    if (data.name !== undefined) t.name = data.name;
    if (data.description !== undefined) t.description = data.description;
    if (data.category !== undefined) t.category = data.category;
    if (data.priority !== undefined) t.priority = data.priority as PriorityType;
    t.updated_at = now();

    return t;
  },

  delete(id: string): boolean {
    const idx = getStore().templates.findIndex(t => t.id === id);
    if (idx === -1) return false;
    getStore().templates.splice(idx, 1);
    return true;
  }
};

export const templateContentRepo = {
  upsert(data: {
    template_id: string;
    language: string;
    channel: ChannelType;
    subject?: string;
    content: string;
  }): TemplateContent {
    const existing = getStore().templateContents.find(
      tc => tc.template_id === data.template_id && tc.language === data.language && tc.channel === data.channel
    );

    if (existing) {
      if (data.subject !== undefined) existing.subject = data.subject;
      existing.content = data.content;
      existing.updated_at = now();
      return existing;
    }

    const tc: TemplateContent = {
      id: getStore().templateContents.length + 1,
      template_id: data.template_id,
      language: data.language,
      channel: data.channel,
      subject: data.subject,
      content: data.content,
      created_at: now(),
      updated_at: now()
    };
    getStore().templateContents.push(tc);
    return tc;
  },

  get(template_id: string, language: string, channel: ChannelType): TemplateContent | undefined {
    return getStore().templateContents.find(
      tc => tc.template_id === template_id && tc.language === language && tc.channel === channel
    );
  },

  listByTemplate(template_id: string): TemplateContent[] {
    return getStore().templateContents
      .filter(tc => tc.template_id === template_id)
      .sort((a, b) => {
        if (a.language !== b.language) return a.language.localeCompare(b.language);
        return a.channel.localeCompare(b.channel);
      });
  },

  delete(id: number): boolean {
    const idx = getStore().templateContents.findIndex(tc => tc.id === id);
    if (idx === -1) return false;
    getStore().templateContents.splice(idx, 1);
    return true;
  },

  findBestMatch(template_id: string, language: string, channel: ChannelType): TemplateContent | undefined {
    const all = getStore().templateContents.filter(
      tc => tc.template_id === template_id && tc.channel === channel
    );
    if (all.length === 0) return undefined;

    const exact = all.find(tc => tc.language === language);
    if (exact) return exact;

    const en = all.find(tc => tc.language === 'en');
    if (en) return en;

    return all[0];
  }
};

export const userRepo = {
  create(data: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    language?: string;
  }): User {
    const u: User = {
      id: data.id || generateId(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      language: data.language || 'zh-CN',
      created_at: now()
    };
    getStore().users.push(u);
    return u;
  },

  get(id: string): User | undefined {
    return getStore().users.find(u => u.id === id);
  },

  getByEmail(email: string): User | undefined {
    return getStore().users.find(u => u.email === email);
  },

  list(params?: { page?: number; pageSize?: number }): { items: User[]; total: number } {
    let items = [...getStore().users];
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    items = items.slice(offset, offset + pageSize);

    return { items, total };
  },

  update(id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    language?: string;
  }): User | undefined {
    const u = this.get(id);
    if (!u) return undefined;

    if (data.name !== undefined) u.name = data.name;
    if (data.email !== undefined) u.email = data.email;
    if (data.phone !== undefined) u.phone = data.phone;
    if (data.language !== undefined) u.language = data.language;

    return u;
  },

  delete(id: string): boolean {
    const idx = getStore().users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    getStore().users.splice(idx, 1);
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
      return existing;
    }

    const p: UserPreference = {
      id: getStore().userPreferences.length + 1,
      user_id: userId,
      category,
      channel,
      enabled,
      updated_at: now()
    };
    getStore().userPreferences.push(p);
    return p;
  },

  bulkSet(userId: string, prefs: { category: string; channel: ChannelType; enabled: boolean }[]): void {
    for (const p of prefs) {
      this.set(userId, p.category, p.channel, p.enabled);
    }
  },

  get(userId: string, category?: string): UserPreference[] {
    let items = getStore().userPreferences.filter(p => p.user_id === userId);
    if (category) {
      items = items.filter(p => p.category === category);
    }
    return items.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.channel.localeCompare(b.channel);
    });
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
    template_id: string;
    user_id?: string;
    recipient?: string;
    channel: ChannelType;
    priority?: PriorityType;
    params?: Record<string, any>;
    scheduled_at?: number;
    max_retries?: number;
  }): QueueMessage {
    const msg: QueueMessage = {
      id: generateId(),
      template_id: data.template_id,
      user_id: data.user_id,
      recipient: data.recipient,
      channel: data.channel,
      priority: data.priority || 'normal',
      status: 'pending',
      retry_count: 0,
      max_retries: data.max_retries ?? 3,
      params: data.params,
      scheduled_at: data.scheduled_at || now(),
      created_at: now()
    };
    getStore().messageQueue.push(msg);
    return msg;
  },

  get(id: string): QueueMessage | undefined {
    return getStore().messageQueue.find(m => m.id === id);
  },

  getNext(channel?: ChannelType, limit: number = 10): QueueMessage[] {
    const nowTime = now();
    let items = getStore().messageQueue.filter(m => m.status === 'pending' && m.scheduled_at <= nowTime);
    if (channel) {
      items = items.filter(m => m.channel === channel);
    }

    const priorityOrder: Record<PriorityType, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    items.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.scheduled_at - b.scheduled_at;
    });

    return items.slice(0, limit);
  },

  updateStatus(id: string, status: MessageStatus, errorMessage?: string): void {
    const msg = this.get(id);
    if (!msg) return;

    msg.status = status;
    if (status === 'sent' || status === 'delivered') {
      msg.sent_at = now();
      if (status === 'delivered') {
        msg.delivered_at = now();
      }
    }
    if (errorMessage) {
      msg.error_message = errorMessage;
    }
  },

  incrementRetry(id: string, errorMessage: string, retryDelay: number): boolean {
    const msg = this.get(id);
    if (!msg) return false;

    msg.retry_count += 1;
    msg.error_message = errorMessage;
    const shouldRetry = msg.retry_count < msg.max_retries;

    if (shouldRetry) {
      msg.status = 'pending';
      msg.scheduled_at = now() + retryDelay;
    } else {
      msg.status = 'failed';
    }

    return shouldRetry;
  },

  remove(id: string): boolean {
    const idx = getStore().messageQueue.findIndex(m => m.id === id);
    if (idx === -1) return false;
    getStore().messageQueue.splice(idx, 1);
    return true;
  },

  stats(): {
    total: number;
    pending: number;
    sending: number;
    failed: number;
    byChannel: { channel: ChannelType; pending: number; sending: number; failed: number; total: number }[];
  } {
    const all = getStore().messageQueue;
    const total = all.length;
    const pending = all.filter(m => m.status === 'pending').length;
    const sending = all.filter(m => m.status === 'sending').length;
    const failed = all.filter(m => m.status === 'failed').length;

    const channels: ChannelType[] = ['email', 'sms', 'inapp', 'webhook'];
    const byChannel = channels.map(channel => {
      const channelMsgs = all.filter(m => m.channel === channel);
      return {
        channel,
        pending: channelMsgs.filter(m => m.status === 'pending').length,
        sending: channelMsgs.filter(m => m.status === 'sending').length,
        failed: channelMsgs.filter(m => m.status === 'failed').length,
        total: channelMsgs.length
      };
    });

    return { total, pending, sending, failed, byChannel };
  },

  list(params?: {
    status?: MessageStatus;
    channel?: ChannelType;
    page?: number;
    pageSize?: number;
  }): { items: QueueMessage[]; total: number } {
    let items = [...getStore().messageQueue];
    if (params?.status) {
      items = items.filter(m => m.status === params.status);
    }
    if (params?.channel) {
      items = items.filter(m => m.channel === params.channel);
    }
    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    items = items.slice(offset, offset + pageSize);

    return { items, total };
  }
};

export const historyRepo = {
  record(data: Omit<SendHistory, 'id' | 'created_at'> & { id?: string; created_at?: number }): SendHistory {
    const record: SendHistory = {
      id: data.id || generateId(),
      template_id: data.template_id,
      template_name: data.template_name,
      user_id: data.user_id,
      recipient: data.recipient,
      channel: data.channel,
      priority: data.priority,
      status: data.status,
      language: data.language,
      subject: data.subject,
      content: data.content,
      params: data.params,
      retry_count: data.retry_count || 0,
      error_message: data.error_message,
      created_at: data.created_at || now(),
      sent_at: data.sent_at,
      delivered_at: data.delivered_at,
      duration_ms: data.duration_ms
    };
    getStore().sendHistory.push(record);
    return record;
  },

  get(id: string): SendHistory | undefined {
    return getStore().sendHistory.find(h => h.id === id);
  },

  list(params?: {
    channel?: ChannelType;
    status?: MessageStatus;
    template_id?: string;
    user_id?: string;
    start_time?: number;
    end_time?: number;
    page?: number;
    pageSize?: number;
  }): { items: SendHistory[]; total: number } {
    let items = [...getStore().sendHistory];
    if (params?.channel) items = items.filter(h => h.channel === params.channel);
    if (params?.status) items = items.filter(h => h.status === params.status);
    if (params?.template_id) items = items.filter(h => h.template_id === params.template_id);
    if (params?.user_id) items = items.filter(h => h.user_id === params.user_id);
    if (params?.start_time) items = items.filter(h => h.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(h => h.created_at <= params.end_time!);

    items.sort((a, b) => b.created_at - a.created_at);
    const total = items.length;

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    items = items.slice(offset, offset + pageSize);

    return { items, total };
  },

  deliveryStats(params?: {
    channel?: ChannelType;
    template_id?: string;
    start_time?: number;
    end_time?: number;
  }): {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    delivery_rate: number;
    success_rate: number;
  } {
    let items = getStore().sendHistory;
    if (params?.channel) items = items.filter(h => h.channel === params.channel);
    if (params?.template_id) items = items.filter(h => h.template_id === params.template_id);
    if (params?.start_time) items = items.filter(h => h.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(h => h.created_at <= params.end_time!);

    const total = items.length;
    const sent = items.filter(h => h.status === 'sent' || h.status === 'delivered').length;
    const delivered = items.filter(h => h.status === 'delivered').length;
    const failed = items.filter(h => h.status === 'failed').length;

    return {
      total,
      sent,
      delivered,
      failed,
      delivery_rate: total > 0 ? delivered / total : 0,
      success_rate: total > 0 ? sent / total : 0
    };
  },

  statsByChannel(params?: {
    start_time?: number;
    end_time?: number;
  }): { channel: ChannelType; stats: { total: number; sent: number; delivered: number; failed: number; delivery_rate: number; success_rate: number } }[] {
    const channels: ChannelType[] = ['email', 'sms', 'inapp', 'webhook'];
    return channels.map(channel => ({
      channel,
      stats: this.deliveryStats({ ...params, channel })
    }));
  },

  statsByTemplate(params?: {
    start_time?: number;
    end_time?: number;
    limit?: number;
  }): { template_id: string; template_name: string; stats: { total: number; sent: number; delivered: number; failed: number; delivery_rate: number; success_rate: number } }[] {
    const templateMap = new Map<string, { template_id: string; template_name: string; total: number; sent: number; delivered: number; failed: number }>();

    let items = getStore().sendHistory;
    if (params?.start_time) items = items.filter(h => h.created_at >= params.start_time!);
    if (params?.end_time) items = items.filter(h => h.created_at <= params.end_time!);

    for (const h of items) {
      if (!templateMap.has(h.template_id)) {
        templateMap.set(h.template_id, {
          template_id: h.template_id,
          template_name: h.template_name,
          total: 0,
          sent: 0,
          delivered: 0,
          failed: 0
        });
      }
      const entry = templateMap.get(h.template_id)!;
      entry.total++;
      if (h.status === 'sent' || h.status === 'delivered') entry.sent++;
      if (h.status === 'delivered') entry.delivered++;
      if (h.status === 'failed') entry.failed++;
    }

    let result = Array.from(templateMap.values()).map(e => ({
      template_id: e.template_id,
      template_name: e.template_name,
      stats: {
        total: e.total,
        sent: e.sent,
        delivered: e.delivered,
        failed: e.failed,
        delivery_rate: e.total > 0 ? e.delivered / e.total : 0,
        success_rate: e.total > 0 ? e.sent / e.total : 0
      }
    }));

    result.sort((a, b) => b.stats.total - a.stats.total);

    if (params?.limit) {
      result = result.slice(0, params.limit);
    }

    return result;
  }
};

export const alertRepo = {
  create(data: {
    type: string;
    level: AlertLevel;
    message: string;
    channel?: ChannelType;
    details?: string;
  }): Alert {
    const alert: Alert = {
      id: getStore().alerts.length + 1,
      type: data.type,
      level: data.level,
      message: data.message,
      channel: data.channel,
      details: data.details,
      resolved: false,
      created_at: now()
    };
    getStore().alerts.push(alert);
    return alert;
  },

  resolve(id: number): boolean {
    const alert = getStore().alerts.find(a => a.id === id);
    if (!alert) return false;
    alert.resolved = true;
    alert.resolved_at = now();
    return true;
  },

  findActive(type: string, channel?: ChannelType): Alert | undefined {
    return getStore().alerts.find(
      a => a.type === type && !a.resolved && (channel === undefined || a.channel === channel)
    );
  },

  list(params?: {
    level?: AlertLevel;
    resolved?: boolean;
    type?: string;
    channel?: ChannelType;
    page?: number;
    pageSize?: number;
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
    const offset = (page - 1) * pageSize;
    items = items.slice(offset, offset + pageSize);

    return { items, total };
  },

  getActive(): Alert[] {
    return getStore().alerts.filter(a => !a.resolved);
  }
};

export const db = {
  init: initDatabase,
  templates: templateRepo,
  templateContents: templateContentRepo,
  users: userRepo,
  userPreferences: userPreferenceRepo,
  queue: queueRepo,
  history: historyRepo,
  alerts: alertRepo
};

export default db;
