import { ChannelAdapter, ChannelResult, ChannelType } from '../types';

export class WebhookAdapter implements ChannelAdapter {
  name: ChannelType = 'webhook';

  async send(
    recipient: string,
    subject: string | undefined,
    content: string,
    params?: Record<string, any>
  ): Promise<ChannelResult> {
    try {
      if (!recipient || !recipient.startsWith('http')) {
        return { success: false, error: 'Invalid webhook URL' };
      }
      console.log(`[Webhook] POST to ${recipient}`);
      
      const payload = {
        subject: subject || '',
        content,
        params: params || {},
        timestamp: Date.now()
      };

      const simulateFailure = params?.simulate_failure === true;
      if (simulateFailure) {
        return { success: false, error: 'Webhook request failed with status 500' };
      }

      const messageId = `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        messageId,
        delivered: true
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const webhookAdapter = new WebhookAdapter();
