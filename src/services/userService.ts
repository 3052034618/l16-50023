import { User, UserPreference, ChannelType } from '../types';
import { userRepo, userPreferenceRepo } from '../database/store';

const DEFAULT_CATEGORIES = ['general', 'security', 'marketing', 'system', 'verification'];
const CHANNELS: ChannelType[] = ['email', 'sms', 'inapp', 'webhook'];
const DEFAULT_LANGUAGE = 'zh-CN';

export class UserService {
  createUser(data: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    language?: string;
  }): User {
    const user = userRepo.create(data);
    this.initDefaultPreferences(user.id);
    return user;
  }

  getUser(id: string): User | undefined {
    return userRepo.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    return userRepo.getByEmail(email);
  }

  listUsers(params?: { page?: number; pageSize?: number }): {
    items: User[];
    total: number;
  } {
    return userRepo.list(params);
  }

  updateUser(id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    language?: string;
  }): User | undefined {
    return userRepo.update(id, data);
  }

  deleteUser(id: string): boolean {
    return userRepo.delete(id);
  }

  private initDefaultPreferences(userId: string) {
    const prefs: { category: string; channel: ChannelType; enabled: boolean }[] = [];
    for (const category of DEFAULT_CATEGORIES) {
      for (const channel of CHANNELS) {
        prefs.push({
          category,
          channel,
          enabled: this.getDefaultEnabled(category, channel)
        });
      }
    }
    userPreferenceRepo.bulkSet(userId, prefs);
  }

  private getDefaultEnabled(category: string, channel: ChannelType): boolean {
    if (category === 'security' || category === 'verification') {
      return true;
    }
    if (channel === 'sms' || channel === 'webhook') {
      return false;
    }
    return true;
  }

  getUserPreferences(userId: string, category?: string): UserPreference[] {
    return userPreferenceRepo.get(userId, category);
  }

  setPreference(
    userId: string,
    category: string,
    channel: ChannelType,
    enabled: boolean
  ): UserPreference {
    return userPreferenceRepo.set(userId, category, channel, enabled);
  }

  isChannelEnabled(
    userId: string,
    category: string,
    channel: ChannelType
  ): boolean {
    const enabled = userPreferenceRepo.isEnabled(userId, category, channel);
    if (enabled === undefined) {
      return this.getDefaultEnabled(category, channel);
    }
    return enabled;
  }

  getEnabledChannels(
    userId: string,
    category: string,
    skipPreferenceCheck: boolean = false
  ): ChannelType[] {
    if (skipPreferenceCheck) {
      return [...CHANNELS];
    }
    const prefs = this.getUserPreferences(userId, category);
    if (prefs.length > 0) {
      return prefs.filter(p => p.enabled).map(p => p.channel);
    }
    return CHANNELS.filter(ch => this.getDefaultEnabled(category, ch));
  }
}

export const userService = new UserService();
