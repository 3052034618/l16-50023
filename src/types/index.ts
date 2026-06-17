export type ChannelType = 'email' | 'sms' | 'inapp' | 'webhook';

export type PriorityType = 'low' | 'normal' | 'high' | 'urgent';

export type MessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'cancelled';

export type AlertLevel = 'info' | 'warning' | 'critical';

export type TemplateStatus = 'draft' | 'published';

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: string;
  priority: PriorityType;
  status: TemplateStatus;
  current_version: number;
  published_version: number;
  created_at: number;
  updated_at: number;
}

export interface TemplateContent {
  id?: number;
  template_id: string;
  language: string;
  channel: ChannelType;
  subject?: string;
  content: string;
  version: number;
  created_at: number;
  updated_at: number;
}

export interface User {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  language: string;
  created_at: number;
}

export interface UserPreference {
  id?: number;
  user_id: string;
  category: string;
  channel: ChannelType;
  enabled: boolean;
  updated_at: number;
}

export interface QueueMessage {
  id: string;
  template_id: string;
  user_id?: string;
  recipient?: string;
  channel: ChannelType;
  priority: PriorityType;
  status: MessageStatus;
  retry_count: number;
  max_retries: number;
  params?: Record<string, any>;
  error_message?: string;
  scheduled_at: number;
  created_at: number;
  sent_at?: number;
  delivered_at?: number;
  language: string;
  app_id?: string;
  rendered_subject?: string;
  rendered_content?: string;
  template_version?: number;
}

export interface SendHistory {
  id: string;
  template_id: string;
  template_name: string;
  user_id?: string;
  recipient?: string;
  channel: ChannelType;
  priority: PriorityType;
  status: MessageStatus;
  language: string;
  subject?: string;
  content: string;
  params?: Record<string, any>;
  retry_count: number;
  error_message?: string;
  created_at: number;
  sent_at?: number;
  delivered_at?: number;
  duration_ms?: number;
  app_id?: string;
}

export interface PushRequest {
  template_id: string;
  user_id?: string;
  recipient?: string;
  channels?: ChannelType[];
  params?: Record<string, any>;
  priority?: PriorityType;
  scheduled_at?: number;
  language?: string;
  app_id?: string;
}

export interface ChannelResult {
  success: boolean;
  messageId?: string;
  error?: string;
  delivered?: boolean;
}

export interface ChannelAdapter {
  name: ChannelType;
  send(recipient: string, subject: string | undefined, content: string, params?: Record<string, any>): Promise<ChannelResult>;
}

export type DataTag = 'production' | 'demo' | 'test';

export interface DeliveryStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  cancelled: number;
  delivery_rate: number;
  success_rate: number;
  cancel_rate: number;
}

export interface Alert {
  id?: number;
  type: string;
  level: AlertLevel;
  message: string;
  channel?: ChannelType;
  details?: string;
  resolved: boolean;
  created_at: number;
  resolved_at?: number;
}

export interface AppClient {
  id: string;
  name: string;
  secret: string;
  description?: string;
  enabled: boolean;
  ip_whitelist: string[];
  created_at: number;
  updated_at: number;
}

export interface BacklogSnapshot {
  timestamp: number;
  channel: ChannelType;
  pending: number;
  sending: number;
  failed: number;
}

export interface FailureReasonEntry {
  error: string;
  count: number;
  latest_at: number;
  channel: ChannelType;
}

export interface AuditLog {
  id: number;
  app_id: string;
  action: string;
  endpoint: string;
  ip: string;
  status: 'success' | 'auth_failed' | 'ip_blocked' | 'error';
  error_message?: string;
  created_at: number;
}

export interface LatencyBucket {
  channel: ChannelType;
  p50: number;
  p90: number;
  p99: number;
  max: number;
  avg: number;
  count: number;
}

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerState {
  channel: ChannelType;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure_at?: number;
  last_state_change_at: number;
  half_open_attempts: number;
  threshold: number;
  reset_timeout_ms: number;
}

export interface RateLimiterState {
  channel: ChannelType;
  max_rps: number;
  current_tokens: number;
  total_allowed: number;
  total_rejected: number;
  last_refill_at: number;
}
