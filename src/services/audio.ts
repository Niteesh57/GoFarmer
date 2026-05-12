import { CactusLM, type CactusLMMessage } from 'cactus-react-native';

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
    const result = await lm.complete({
      messages,
      audio: audioChunk,
      onToken,
      options: {
        temperature: 0.1,
        maxTokens: 512,
        topP: 0.9,
        topK: 40,
        enableThinking: false, // Ensure direct output for voice responses
      }
    });

    return result.response;
  } catch (error) {
    console.error('[AudioService] Error generating response:', error);
    throw error;
  }
};
