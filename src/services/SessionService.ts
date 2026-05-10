import AsyncStorage from '@react-native-async-storage/async-storage';
import { CactusLMMessage } from 'cactus-react-native';

export interface MessageMetadata {
  ttft: number;
  totalTime: number;
  tokenCount: number;
  tokensPerSecond: number;
}

export interface AppMessage extends CactusLMMessage {
  metadata?: MessageMetadata;
  image_url?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: AppMessage[];
  timestamp: number;
}

const SESSIONS_KEY = '@GOFARMER_sessions';

export const SessionService = {
  async getAllSessions(): Promise<ChatSession[]> {
    try {
      const data = await AsyncStorage.getItem(SESSIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load sessions', e);
      return [];
    }
  },

  async saveSession(session: ChatSession): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      const index = sessions.findIndex(s => s.id === session.id);
      if (index > -1) {
        sessions[index] = session;
      } else {
        sessions.unshift(session);
      }
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to save session', e);
    }
  },

  async deleteSession(id: string): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      const filtered = sessions.filter(s => s.id !== id);
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to delete session', e);
    }
  }
};
