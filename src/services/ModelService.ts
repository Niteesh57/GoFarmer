import { CactusLM } from 'cactus-react-native';
// @ts-ignore
import { CactusFileSystem } from '../../node_modules/cactus-react-native/src/native/CactusFileSystem';

export const RAG_FILE_URL = 'https://raw.githubusercontent.com/Niteesh57/GOFARMER/main/vector/rag.txt';
export const RAG_FILE_PATH = '/data/local/tmp/GOFARMER-vector/rag.txt';

export const ModelService = {
  async downloadModel(modelId: string, onProgress: (progress: number) => void, force = false): Promise<void> {
    const q = 'int4' as const;
    
    // If force is requested, or if we want to ensure no partial files exist, delete first
    if (force) {
      await this.deleteModel(modelId);
    } else {
      // Check if it already exists to avoid redundant work
      const exists = await this.modelExists(modelId);
      if (exists) {
        onProgress(100);
        return;
      }
    }

    const downloader = new CactusLM({ model: modelId, options: { quantization: q } });

    try {
      // The download method returns a promise that resolves when complete
      await (downloader as any).download({
        onProgress: (p: number) => {
          onProgress(Math.round(p * 100));
        }
      });
    } catch (e) {
      // If download fails, it might leave partial files. 
      // We don't delete here to allow for potential resume in future, 
      // but we throw so the UI can handle the error.
      throw e;
    }
  },

  async repairModel(modelId: string, onProgress: (progress: number) => void): Promise<void> {
    // Explicitly delete and redownload
    await this.deleteModel(modelId);
    return this.downloadModel(modelId, onProgress, true);
  },

  async downloadRag(onProgress?: (progress: number) => void): Promise<void> {
    if (onProgress) onProgress(20);
    const response = await fetch(RAG_FILE_URL);
    if (!response.ok) throw new Error('Failed to fetch knowledge base');
    
    if (onProgress) onProgress(50);
    const text = await response.text();
    if (onProgress) onProgress(80);
    await CactusFileSystem.writeFile(RAG_FILE_PATH, text);
    if (onProgress) onProgress(100);
  },

  async deleteModel(modelId: string): Promise<void> {
    const q = 'int4';
    const modelName = `${modelId}-${q}`;
    
    try {
      // 1. Try deleting through the native library's dedicated method
      await CactusFileSystem.deleteModel(modelName);
      
      // 2. Proactively clean up any potential leftover zip files or metadata
      // The library might download these to temp locations
      const potentialZipPath = `/data/local/tmp/${modelName}.zip`;
      const exists = await CactusFileSystem.fileExists(potentialZipPath);
      if (exists) {
        await CactusFileSystem.deleteFile(potentialZipPath);
      }
      
      console.log(`[ModelService] Thorough deletion completed for ${modelName}`);
    } catch (e) {
      console.error(`[ModelService] Error during thorough deletion of ${modelName}: ${e}`);
      // No fallback needed as per user request - we want the files GONE.
    }
  },

  async modelExists(modelId: string): Promise<boolean> {
    const q = 'int4';
    const modelName = `${modelId}-${q}`;
    return await CactusFileSystem.modelExists(modelName);
  },

  async ragExists(): Promise<boolean> {
    return await CactusFileSystem.fileExists(RAG_FILE_PATH);
  }
};
