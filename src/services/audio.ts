import { CactusLM, type CactusLMMessage } from 'cactus-react-native';
import DeviceInfo from 'react-native-device-info';
import { getDynamicOptions } from '../utils/performance';

/**
 * Streams real-time text generations directly from multimodal PCM audio interactions.
 *
 * Configures the localized CactusLM engine parameters specifically for fast deterministic
 * feedback loops tailored to voice interaction layouts.
 *
 * @param {string} systemPrompt Explicit system persona guiding advisory limits.
 * @param {number[]} audioChunk Raw 16-bit PCM buffer array captured from local device microphones.
 * @param {function(string): void} onToken Token output pipeline handler.
 * @param {CactusLM} lm Instantiated on-device inference driver reference.
 * @return {Promise<string>} Fully combined string result payload.
 */
export const streamAudioVoiceResponse = async (
  systemPrompt: string,
  audioChunk: number[],
  onToken: (token: string) => void,
  lm: CactusLM
): Promise<string> => {
  if (!lm) {
    throw new Error('CactusLM instance is required');
  }

  const messages: CactusLMMessage[] = [
    { 
      role: 'system', 
      content: systemPrompt 
    },
    { 
      role: 'user', 
      content: 'Analyze the following audio and provide a response.' 
    }
  ];

  try {
    const usedMem = await DeviceInfo.getUsedMemory();
    const totalMem = await DeviceInfo.getTotalMemory();
    const freeRamGB = (totalMem - usedMem) / (1024 * 1024 * 1024);

    const result = await lm.complete({
      messages,
      audio: audioChunk,
      onToken,
      options: getDynamicOptions(freeRamGB, 'factual')
    });

    return result.response;
  } catch (error) {
    console.error('[AudioService] Error generating response:', error);
    throw error;
  }
};
