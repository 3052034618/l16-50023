export type ChannelType = 'email' | 'sms' | 'inapp' | 'webhook';

export type PriorityType = 'low' | 'normal' | 'high' | 'urgent';

export type MessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'failed';

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: string;
  priority: PriorityType;
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

export interface QueueStats {
  pending: number;
  sending: number;
  failed: number;
  total: number;
}

export interface ChannelStats {
  channel: ChannelType;
  pending: number;
  sending: number;
  total: number;
}

export interface DeliveryStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  delivery_rate: number;
  success_rate: number;
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
