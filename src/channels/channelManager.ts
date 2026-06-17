import { ChannelAdapter, ChannelType, ChannelResult } from '../types';
import { emailAdapter } from './emailAdapter';
import { smsAdapter } from './smsAdapter';
import { inAppAdapter } from './inAppAdapter';
import { webhookAdapter } from './webhookAdapter';

class ChannelManager {
  private adapters: Map<ChannelType, ChannelAdapter> = new Map();

  constructor() {
    this.register(emailAdapter);
    this.register(smsAdapter);
    this.register(inAppAdapter);
    this.register(webhookAdapter);
  }

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  getAdapter(channel: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  hasChannel(channel: ChannelType): boolean {
    return this.adapters.has(channel);
  }

  getChannels(): ChannelType[] {
    return Array.from(this.adapters.keys()) as ChannelType[];
  }

  async send(
    channel: ChannelType,
    recipient: string,
    subject: string | undefined,
    content: string,
    params?: Record<string, any>
  ): Promise<ChannelResult> {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      return { success: false, error: `Channel ${channel} not found` };
    }
    return adapter.send(recipient, subject, content, params);
  }
}

export const channelManager = new ChannelManager();
