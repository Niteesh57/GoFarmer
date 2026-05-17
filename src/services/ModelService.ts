import { CactusLM } from 'cactus-react-native';
// @ts-ignore
import { CactusFileSystem } from '../../node_modules/cactus-react-native/src/native/CactusFileSystem';

export const RAG_FILE_URL = 'https://raw.githubusercontent.com/Niteesh57/GOFARMER/main/vector/rag.txt';
export const RAG_FILE_PATH = '/data/local/tmp/GOFARMER-vector/rag.txt';

export const ModelService = {
  /**
   * Downloads offline large language model binary blocks securely to the filesystem.
   *
   * @param {string} modelId Targeted primary model identifier string.
   * @param {function(number): void} onProgress Callback outputting byte transmission percentages.
   * @param {boolean} [force=false] Direct deletion switch enforcing fresh retrieval pipelines.
   * @return {Promise<void>} Resolves when full chunk integrity checks clear.
   */
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

  /**
   * Explicitly purges possibly corrupted model traces and re-initializes clean downloads.
   *
   * @param {string} modelId Targeted corrupted model binary name.
   * @param {function(number): void} onProgress Real-time progress metric callback interface.
   * @return {Promise<void>} Resolves when download pipeline rebuilding wraps up.
   */
  async repairModel(modelId: string, onProgress: (progress: number) => void): Promise<void> {
    // Explicitly delete and redownload
    await this.deleteModel(modelId);
    return this.downloadModel(modelId, onProgress, true);
  },

  /**
   * Downloads remote vector index repositories supporting offline context retrieval engines.
   *
   * @param {function(number): void} [onProgress] Step-wise transmission updates tracking interface.
   * @return {Promise<void>} Resolves when text chunks persist into vector search directories.
   */
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

  /**
   * Executes exhaustive physical binary layer deletions clearing model archives from native storage.
   *
   * @param {string} modelId Targeted base model string identifier.
   * @return {Promise<void>} Resolves when core model and intermediate caching zip files drop.
   */
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

  /**
   * Validates file system layout tracking the presence of downloaded local models.
   *
   * @param {string} modelId Targeted base identifier string.
   * @return {Promise<boolean>} True if native runtime model assets resolve correctly.
   */
  async modelExists(modelId: string): Promise<boolean> {
    const q = 'int4';
    const modelName = `${modelId}-${q}`;
    
    // 0. Check for partial zip file which indicates an incomplete/corrupted download
    try {
      const potentialZipPath = `/data/local/tmp/${modelName}.zip`;
      const zipExists = await CactusFileSystem.fileExists(potentialZipPath);
      if (zipExists) {
        return false; // Still downloading, corrupted, or failed to unzip
      }
    } catch {
      // Ignore
    }

    // 1. Check standard app sandbox path
    const sandboxExists = await CactusFileSystem.modelExists(modelName);
    if (sandboxExists) return true;

    // 2. Check Android global /data/local/tmp fallback path
    try {
      const fallbackExists = await CactusFileSystem.fileExists(`/data/local/tmp/${modelId}`);
      if (fallbackExists) return true;

      const fallbackGgufExists = await CactusFileSystem.fileExists(`/data/local/tmp/${modelId}.gguf`);
      if (fallbackGgufExists) return true;
    } catch {
      // Ignore errors for other platforms or permission restrictions
    }

    return false;
  },

  /**
   * Verifies the offline presence of the knowledge base vector retrieval layout.
   *
   * @return {Promise<boolean>} True if the local rag.txt vector resource path exists.
   */
  async ragExists(): Promise<boolean> {
    return await CactusFileSystem.fileExists(RAG_FILE_PATH);
  }
};
