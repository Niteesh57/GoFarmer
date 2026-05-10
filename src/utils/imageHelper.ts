import ImageResizer from '@bam.tech/react-native-image-resizer';

/**
 * Compresses and resizes an image to optimize it for LLM processing.
 * This significantly reduces RAM usage and speeds up the "thinking" phase.
 * 
 * @param imageUri The local file URI of the image
 * @returns The new compressed image URI
 */
export const optimizeImageForLLM = async (imageUri: string): Promise<string> => {
  try {
    // 800x800 is a good balance for LLM vision models (they usually scale to 336x336 or similar internally anyway)
    // 80% JPEG quality provides good visual fidelity while drastically cutting file size
    const response = await ImageResizer.createResizedImage(
      imageUri,
      800,
      800,
      'JPEG',
      80,
      0, // rotation
      undefined, // outputPath
      false, // keepMeta
      { mode: 'contain', onlyScaleDown: true }
    );
    
    return response.uri;
  } catch (err) {
    console.error('Error optimizing image:', err);
    return imageUri; // Fallback to original if optimization fails
  }
};
