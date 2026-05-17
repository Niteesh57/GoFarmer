import { type CactusLMCompleteOptions } from 'cactus-react-native';

/**
 * Returns customized, tier-based CactusLM completion parameters dynamically scaled
 * to target device hardware specs (free RAM):
 * 1. Low Tier (3GB to 5GB): Safe memory allocations, lower tokens, strict factual output.
 * 2. Medium Tier (5GB to 8GB): Standard standard context, balanced deterministic metrics.
 * 3. High Tier (8GB+): Rich contextual capacity, longer tokens, and maximum creative potential.
 *
 * @param {number} freeRamGB Available device memory in Gigabytes.
 * @param {'factual' | 'creative'} mode Influence category affecting temperature limits.
 * @returns {CactusLMCompleteOptions} Scaled CactusLM completion options dictionary.
 */
export const getDynamicOptions = (
  freeRamGB: number,
  mode: 'factual' | 'creative'
): CactusLMCompleteOptions => {
  if (freeRamGB < 5) {
    // ─── Low Tier: 3GB to 5GB (Absolute Stability / Strict Control) ───
    return {
      maxTokens: 256,
      temperature: 0.1,
      topP: 0.8,
      topK: 30,
      enableThinking: false,
    };
  } else if (freeRamGB < 8) {
    // ─── Medium Tier: 5GB to 8GB (Balanced Settings) ───
    return {
      maxTokens: mode === 'creative' ? 600 : 512,
      temperature: mode === 'creative' ? 0.6 : 0.1,
      topP: 0.9,
      topK: 40,
      enableThinking: false,
    };
  } else {
    // ─── High Tier: 8GB+ (Maximum Power & Creativity) ───
    return {
      maxTokens: 1024,
      temperature: mode === 'creative' ? 0.8 : 0.2,
      topP: 0.95,
      topK: 50,
      enableThinking: false,
    };
  }
};
