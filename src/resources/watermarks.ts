import type {
  WatermarkInput,
  WatermarkOptions,
  WatermarkResult,
  WatermarkStatus,
  WatermarkMetadata,
  RequestOptions,
  FilterName,
  FileType,
} from '../types/index.js';
import { ValidationError, TimeoutError, SaferLayerError } from '../errors/index.js';
import type { SaferLayerClient } from '../client.js';
import { prepareImage } from '../client.js';
import pLimit from 'p-limit';

const VALID_FILTERS: readonly FilterName[] = ['isoline', 'bulge'];
const POLL_INTERVAL = 1000; // 1 second
const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const MAX_CONCURRENCY = 20;

/**
 * Resource for creating watermarks.
 */
export class Watermarks {
  constructor(private readonly client: SaferLayerClient) {}

  /**
   * Watermark one or more images.
   * 
   * Queues all images for processing, polls for completion,
   * and returns all results when done.
   *
   * @example
   * ```typescript
   * const results = await client.watermarks.create({
   *   watermarks: [
   *     { image: './id-front.jpg', text: 'Provided by John Smith for ID verification only' },
   *     { image: './id-back.jpg', text: 'Provided by John Smith for ID verification only' },
   *   ],
   *   onComplete: (id, result) => console.log(`Done: ${id}`),
   * });
   * ```
   */
  async create(
    options: WatermarkOptions,
    requestOptions?: RequestOptions
  ): Promise<WatermarkResult[]> {
    const { watermarks, onStatusChange, onComplete, onError } = options;
    
    // Validate all inputs first
    for (const input of watermarks) {
      this.validateInput(input);
    }

    const timeout = requestOptions?.timeout ?? DEFAULT_TIMEOUT;
    const limit = pLimit(MAX_CONCURRENCY);

    // Queue all jobs in parallel (max 20 concurrent)
    const jobs: Array<{ input: WatermarkInput; watermarkId: string; index: number }> = [];
    
    const queuePromises = watermarks.map((input, index) => limit(async () => {
      const formData = await this.buildFormData(input);
      
      const response = await this.client.uploadFile(
        '/api/watermarks',
        formData,
        requestOptions
      );

      const data = await response.json() as { watermarkId: string; status: string };
      const job = { input, watermarkId: data.watermarkId, index };
      jobs.push(job);
      
      onStatusChange?.(data.watermarkId, {
        success: true,
        watermarkId: data.watermarkId,
        status: 'queued',
      }, index);
    }));

    await Promise.all(queuePromises);

    // Poll for all completions in parallel
    const results: Array<{ result: WatermarkResult; index: number }> = [];
    const pending = new Map(jobs.map(j => [j.watermarkId, j.index]));
    const errors = new Map<string, Error>();
    const startTime = Date.now();

    while (pending.size > 0) {
      if (Date.now() - startTime > timeout) {
        const remaining = Array.from(pending.keys());
        throw new TimeoutError(
          `Timed out waiting for ${remaining.length} job(s): ${remaining.join(', ')}`,
          timeout
        );
      }

      await sleep(POLL_INTERVAL);

      // Poll all pending jobs in parallel
      const pollPromises = Array.from(pending.entries()).map(([watermarkId, index]) => 
        limit(async () => {
          try {
            const status = await this.getStatus(watermarkId, requestOptions);
            onStatusChange?.(watermarkId, status, index);

            if (status.status === 'completed') {
              onStatusChange?.(watermarkId, { ...status, status: 'downloading' }, index);
              const result = await this.download(watermarkId, requestOptions);
              results.push({ result, index });
              pending.delete(watermarkId);
              await onComplete?.(watermarkId, result, index);
            } else if (status.status === 'failed') {
              const error = new SaferLayerError(
                status.error?.message ?? 'Watermark processing failed',
                status.error?.statusCode
              );
              errors.set(watermarkId, error);
              pending.delete(watermarkId);
              onError?.(watermarkId, error, index);
            }
          } catch {
            // Ignore transient errors during polling, will retry
          }
        })
      );

      await Promise.all(pollPromises);
    }

    // If all jobs failed, throw
    if (results.length === 0 && errors.size > 0) {
      const firstError = errors.values().next().value;
      throw firstError;
    }

    // Sort results by original index and return
    return results
      .sort((a, b) => a.index - b.index)
      .map(r => r.result);
  }

  /**
   * Get the status of a watermark job.
   */
  async getStatus(
    watermarkId: string,
    requestOptions?: RequestOptions
  ): Promise<WatermarkStatus> {
    return await this.client.request<WatermarkStatus>(
      'GET',
      `/api/watermarks/${watermarkId}`,
      requestOptions
    );
  }

  /**
   * Download a completed watermark.
   */
  private async download(
    watermarkId: string,
    requestOptions?: RequestOptions
  ): Promise<WatermarkResult> {
    const response = await this.client.request<Response>(
      'GET',
      `/api/watermarks/${watermarkId}/download`,
      { ...requestOptions, parseJson: false }
    );

    const dataBuffer = Buffer.from(await response.arrayBuffer());
    
    // Determine file type from response header (defaults to 'image' for backward compatibility)
    const fileType = (response.headers.get('X-File-Type') ?? 'image') as FileType;
    const pageCount = response.headers.get('X-Page-Count');
    
    const metadata: WatermarkMetadata = {
      originalSize: {
        width: parseInt(response.headers.get('X-Original-Width') ?? '0', 10),
        height: parseInt(response.headers.get('X-Original-Height') ?? '0', 10),
      },
      watermarkedSize: {
        width: parseInt(response.headers.get('X-Watermarked-Width') ?? '0', 10),
        height: parseInt(response.headers.get('X-Watermarked-Height') ?? '0', 10),
      },
      processingTime: parseInt(response.headers.get('X-Processing-Time') ?? '0', 10),
      ...(pageCount ? { pageCount: parseInt(pageCount, 10) } : {}),
    };

    return {
      watermarkId,
      data: dataBuffer,
      image: dataBuffer, // Backward compatibility alias
      fileType,
      metadata,
    };
  }

  /**
   * Validate a watermark input.
   */
  private validateInput(input: WatermarkInput): void {
    // Support both 'file' and legacy 'image' field
    const file = input.file ?? input.image;
    
    if (!file) {
      throw new ValidationError('File is required (use "file" or "image" field)', 'file');
    }

    if (!input.text) {
      throw new ValidationError('Watermark text is required', 'text');
    }

    if (input.text.length > 100) {
      throw new ValidationError(
        'Watermark text cannot exceed 100 characters',
        'text'
      );
    }

    if (input.skipFilters) {
      const invalidFilters = input.skipFilters.filter(
        f => !VALID_FILTERS.includes(f)
      );
      
      if (invalidFilters.length > 0) {
        throw new ValidationError(
          `Invalid filter name(s): ${invalidFilters.join(', ')}. Valid filters: ${VALID_FILTERS.join(', ')}`,
          'skipFilters'
        );
      }
    }
  }

  /**
   * Build FormData for watermark request.
   */
  private async buildFormData(input: WatermarkInput): Promise<FormData> {
    const formData = new FormData();
    
    // Support both 'file' and legacy 'image' field
    const file = input.file ?? input.image;
    const fileBlob = await prepareImage(file!);
    formData.append('file', fileBlob, 'file');
    formData.append('watermarkText', input.text);

    if (input.skipFilters && input.skipFilters.length > 0) {
      formData.append('skipFilters', input.skipFilters.join(','));
    }

    return formData;
  }
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
