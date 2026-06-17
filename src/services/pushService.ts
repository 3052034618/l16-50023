import { PushRequest, ChannelType, PriorityType, MessageStatus } from '../types';
import { templateService } from './templateService';
import { userService } from './userService';
import { queueService } from './queueService';
import { historyService } from './historyService';
import { channelManager } from '../channels/channelManager';
import { channelRuntimeRepo, latencyRepo } from '../database/store';
import { v4 as uuidv4 } from 'uuid';

const HIGH_PRIORITY_CATEGORIES = ['security', 'verification'];
const HIGH_PRIORITY_LEVELS: PriorityType[] = ['high', 'urgent'];

export class PushService {
  async send(request: PushRequest): Promise<{
    request_id: string;
    messages: { channel: ChannelType; message_id: string; status: string }[];
    skipped?: { channel: ChannelType; reason: string }[];
  }> {
    const requestId = uuidv4();
    const template = templateService.getTemplate(request.template_id);
    if (!template) {
      throw new Error(`Template ${request.template_id} not found`);
    }
    if (template.status !== 'published') {
      throw new Error(`Template ${template.name} is not published, cannot send`);
    }
    if (template.published_version === 0) {
      throw new Error(`Template ${template.name} has no published version`);
    }

    let userId = request.user_id;
    let recipient = request.recipient;
    let language = request.language;

    if (userId && !language) {
      const user = userService.getUser(userId);
      if (user) {
        language = user.language;
      }
    }

    if (!language) {
      language = 'zh-CN';
    }

    const priority = request.priority || template.priority;
    const skipPreferenceCheck = this.isHighPriority(priority, template.category);

    let channels = request.channels;
    if (!channels || channels.length === 0) {
      if (userId) {
        channels = userService.getEnabledChannels(userId, template.category, skipPreferenceCheck);
      } else {
        channels = this.detectChannelsByRecipient(recipient || '');
      }
    }

    if (channels.length === 0) {
      return { request_id: requestId, messages: [] };
    }

    const results: { channel: ChannelType; message_id: string; status: string }[] = [];
    const skipped: { channel: ChannelType; reason: string }[] = [];

    for (const channel of channels) {
      if (!channelManager.hasChannel(channel)) {
        continue;
      }

      let channelRecipient = recipient;
      if (!channelRecipient && userId) {
        channelRecipient = this.getRecipientForChannel(userId, channel);
      }
      if (!channelRecipient) {
        continue;
      }

      const rendered = templateService.renderTemplate(
        request.template_id,
        language,
        channel,
        request.params,
        template.published_version
      );
      if (!rendered) {
        skipped.push({
          channel,
          reason: `Template "${template.name}" (id=${template.id}) missing ${language} content for channel "${channel}" in published version ${template.published_version}`
        });
        continue;
      }

      const msg = queueService.enqueue({
        template_id: request.template_id,
        user_id: userId,
        recipient: channelRecipient,
        channel,
        priority,
        params: request.params,
        scheduled_at: request.scheduled_at,
        language,
        app_id: request.app_id,
        rendered_subject: rendered.subject,
        rendered_content: rendered.content,
        template_version: template.published_version
      });

      results.push({
        channel,
        message_id: msg.id,
        status: msg.status
      });
    }

    return { request_id: requestId, messages: results, ...(skipped.length > 0 ? { skipped } : {}) };
  }

  async processQueue(channel?: ChannelType, batchSize: number = 10): Promise<number> {
    const messages = queueService.getNextMessages(channel, batchSize);
    let processed = 0;

    for (const msg of messages) {
      if (!channelRuntimeRepo.checkCircuit(msg.channel)) {
        continue;
      }

      if (!channelRuntimeRepo.acquireToken(msg.channel)) {
        continue;
      }

      try {
        queueService.updateStatus(msg.id, 'sending');
        const startTime = Date.now();

        const template = templateService.getTemplate(msg.template_id);
        if (!template) {
          throw new Error(`Template ${msg.template_id} not found`);
        }

        const subject = msg.rendered_subject;
        const content = msg.rendered_content;
        const language = msg.language;

        if (!content) {
          throw new Error(`No rendered content for message ${msg.id}`);
        }

        const result = await channelManager.send(
          msg.channel,
          msg.recipient || '',
          subject,
          content,
          msg.params
        );

        const endTime = Date.now();
        const duration = endTime - startTime;

        latencyRepo.record(msg.channel, duration);

        if (result.success) {
          const finalStatus = result.delivered ? 'delivered' : 'sent';
          queueService.updateStatus(msg.id, finalStatus as MessageStatus);
          channelRuntimeRepo.recordSuccess(msg.channel);

          historyService.record({
            id: msg.id,
            template_id: msg.template_id,
            template_name: template.name,
            user_id: msg.user_id,
            recipient: msg.recipient,
            channel: msg.channel,
            priority: msg.priority,
            status: finalStatus as MessageStatus,
            language,
            subject,
            content,
            params: msg.params,
            retry_count: msg.retry_count,
            created_at: msg.created_at,
            sent_at: endTime,
            delivered_at: result.delivered ? endTime : undefined,
            duration_ms: duration,
            app_id: msg.app_id
          });

          queueService.removeMessage(msg.id);
        } else {
          channelRuntimeRepo.recordFailure(msg.channel);
          const willRetry = queueService.incrementRetry(msg.id, result.error || 'Unknown error');
          if (!willRetry) {
            historyService.record({
              id: msg.id,
              template_id: msg.template_id,
              template_name: template.name,
              user_id: msg.user_id,
              recipient: msg.recipient,
              channel: msg.channel,
              priority: msg.priority,
              status: 'failed',
              language,
              subject,
              content,
              params: msg.params,
              retry_count: msg.retry_count + 1,
              error_message: result.error,
              created_at: msg.created_at,
              sent_at: endTime,
              duration_ms: duration,
              app_id: msg.app_id
            });
            queueService.removeMessage(msg.id);
          }
        }
      } catch (error: any) {
        channelRuntimeRepo.recordFailure(msg.channel);
        const willRetry = queueService.incrementRetry(msg.id, error.message);
        if (!willRetry) {
          const template = templateService.getTemplate(msg.template_id);
          historyService.record({
            id: msg.id,
            template_id: msg.template_id,
            template_name: template?.name || 'Unknown',
            user_id: msg.user_id,
            recipient: msg.recipient,
            channel: msg.channel,
            priority: msg.priority,
            status: 'failed',
            language: msg.language,
            content: msg.rendered_content || '',
            params: msg.params,
            retry_count: msg.retry_count + 1,
            error_message: error.message,
            created_at: msg.created_at,
            app_id: msg.app_id
          });
          queueService.removeMessage(msg.id);
        }
      }
      processed++;
    }

    return processed;
  }

  private isHighPriority(priority: PriorityType, category: string): boolean {
    return HIGH_PRIORITY_LEVELS.includes(priority) || HIGH_PRIORITY_CATEGORIES.includes(category);
  }

  private detectChannelsByRecipient(recipient: string): ChannelType[] {
    const channels: ChannelType[] = [];
    if (recipient.includes('@')) {
      channels.push('email');
    }
    if (/^\d{6,}$/.test(recipient.replace(/[+\-\s]/g, ''))) {
      channels.push('sms');
    }
    if (recipient.startsWith('http://') || recipient.startsWith('https://')) {
      channels.push('webhook');
    }
    return channels;
  }

  private getRecipientForChannel(userId: string, channel: ChannelType): string | undefined {
    const user = userService.getUser(userId);
    if (!user) return undefined;

    switch (channel) {
      case 'email':
        return user.email;
      case 'sms':
        return user.phone;
      case 'inapp':
        return userId;
      case 'webhook':
        return undefined;
      default:
        return undefined;
    }
  }
}

export const pushService = new PushService();
