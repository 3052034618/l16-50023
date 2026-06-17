import { ChannelAdapter, ChannelResult, ChannelType } from '../types';

export class SmsAdapter implements ChannelAdapter {
  name: ChannelType = 'sms';

  async send(
    recipient: string,
    subject: string | undefined,
    content: string,
    params?: Record<string, any>
  ): Promise<ChannelResult> {
    try {
      if (!recipient || recipient.length < 6) {
        return { success: false, error: 'Invalid phone number' };
      }
      const message = subject ? `${subject}: ${content}` : content;
      const truncated = message.length > 140 ? message.substring(0, 140) : message;
      console.log(`[SMS] Sending to ${recipient}: ${truncated}`);
      const messageId = `sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const simulateFailure = params?.simulate_failure === true;
      if (simulateFailure) {
        return { success: false, error: 'SMS gateway error' };
      }
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

export const smsAdapter = new SmsAdapter();
