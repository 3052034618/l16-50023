import { ChannelAdapter, ChannelResult, ChannelType } from '../types';

export class EmailAdapter implements ChannelAdapter {
  name: ChannelType = 'email';

  async send(
    recipient: string,
    subject: string | undefined,
    content: string,
    params?: Record<string, any>
  ): Promise<ChannelResult> {
    try {
      if (!recipient || !recipient.includes('@')) {
        return { success: false, error: 'Invalid email address' };
      }
      console.log(`[Email] Sending to ${recipient}: ${subject || '(no subject)'}`);
      const messageId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const simulateFailure = params?.simulate_failure === true;
      if (simulateFailure) {
        return { success: false, error: 'SMTP connection timeout' };
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

export const emailAdapter = new EmailAdapter();
