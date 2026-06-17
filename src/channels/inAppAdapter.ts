import { ChannelAdapter, ChannelResult, ChannelType } from '../types';
import { userRepo } from '../database/store';

export class InAppAdapter implements ChannelAdapter {
  name: ChannelType = 'inapp';

  async send(
    recipient: string,
    subject: string | undefined,
    content: string,
    params?: Record<string, any>
  ): Promise<ChannelResult> {
    try {
      if (!recipient) {
        return { success: false, error: 'Recipient user ID is required' };
      }
      console.log(`[InApp] Sending to user ${recipient}: ${subject || '(no subject)'}`);
      const messageId = `inapp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      let user = userRepo.get(recipient);
      if (!user) {
        userRepo.create({ id: recipient, language: 'zh-CN' });
      }

      const simulateFailure = params?.simulate_failure === true;
      if (simulateFailure) {
        return { success: false, error: 'In-app message store error' };
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

export const inAppAdapter = new InAppAdapter();
