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
  /**
   * Loads all serialized chat conversation objects from asynchronous local storage blocks.
   *
   * @return {Promise<ChatSession[]>} Collection array of persisted session entities.
   */
  async getAllSessions(): Promise<ChatSession[]> {
    try {
      const data = await AsyncStorage.getItem(SESSIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load sessions', e);
      return [];
    }
  },

  /**
   * Writes/updates a dedicated conversation entity block into the primary sessions dictionary.
   *
   * @param {ChatSession} session Targeted session structure carrying complete chat histories.
   * @return {Promise<void>} Resolves when write array operations successfully commit.
   */
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

  /**
   * Removes a targeted chat session array trace from persistent local tracking bounds.
   *
   * @param {string} id Unique target identifier map string.
   * @return {Promise<void>} Resolves when subset block arrays save correctly.
   */
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
