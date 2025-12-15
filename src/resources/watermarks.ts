import type {
  WatermarkInput,
  WatermarkOptions,
  WatermarkResult,
  WatermarkStatus,
  WatermarkMetadata,
  RequestOptions,
  FilterName,
} from '../types/index.js';
import { ValidationError, TimeoutError, SaferLayerError } from '../errors/index.js';
import type { SaferLayerClient } from '../client.js';
import { prepareImage } from '../client.js';

const VALID_FILTERS: readonly FilterName[] = ['isoline', 'bulge'];
const POLL_INTERVAL = 1000; // 1 second
const DEFAULT_TIMEOUT = 300_000; // 5 minutes

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
   * // Single image
   * const [result] = await client.watermarks.create({
   *   images: { image: './doc.jpg', watermarkText: 'CONFIDENTIAL' },
   * });
   * 
   * // Multiple images
   * const results = await client.watermarks.create({
   *   images: [
   *     { image: './doc1.jpg', watermarkText: 'CONFIDENTIAL' },
   *     { image: './doc2.jpg', watermarkText: 'DRAFT' },
   *   ],
   *   onComplete: (id, result) => console.log(`Done: ${id}`),
   * });
   * ```
   */
  async create(
    options: WatermarkOptions,
    requestOptions?: RequestOptions
  ): Promise<WatermarkResult[]> {
    const { images, onStatusChange, onComplete, onError } = options;
    const imageList = Array.isArray(images) ? images : [images];
    
    // Validate all inputs first
    for (const input of imageList) {
      this.validateInput(input);
    }

    const timeout = requestOptions?.timeout ?? DEFAULT_TIMEOUT;

    // Queue all jobs
    const jobs: Array<{ input: WatermarkInput; watermarkId: string }> = [];
    
    for (const input of imageList) {
      const formData = await this.buildFormData(input);
      
      const response = await this.client.uploadFile(
        '/api/watermarks',
        formData,
        requestOptions
      );

      const data = await response.json() as { watermarkId: string; status: string };
      jobs.push({ input, watermarkId: data.watermarkId });
      
      onStatusChange?.(data.watermarkId, {
        success: true,
        watermarkId: data.watermarkId,
        status: 'queued',
      });
    }

    // Poll for all completions
    const results: WatermarkResult[] = [];
    const pending = new Set(jobs.map(j => j.watermarkId));
    const errors = new Map<string, Error>();
    const startTime = Date.now();

    while (pending.size > 0) {
      if (Date.now() - startTime > timeout) {
        const remaining = Array.from(pending);
        throw new TimeoutError(
          `Timed out waiting for ${remaining.length} job(s): ${remaining.join(', ')}`,
          timeout
        );
      }

      await sleep(POLL_INTERVAL);

      for (const watermarkId of pending) {
        try {
          const status = await this.getStatus(watermarkId, requestOptions);
          onStatusChange?.(watermarkId, status);

          if (status.status === 'completed') {
            onStatusChange?.(watermarkId, { ...status, status: 'downloading' });
            const result = await this.download(watermarkId, requestOptions);
            results.push(result);
            pending.delete(watermarkId);
            await onComplete?.(watermarkId, result);
          } else if (status.status === 'failed') {
            const error = new SaferLayerError(
              status.error?.message ?? 'Watermark processing failed',
              status.error?.statusCode
            );
            errors.set(watermarkId, error);
            pending.delete(watermarkId);
            onError?.(watermarkId, error);
          }
        } catch {
          // Ignore transient errors during polling, will retry
        }
      }
    }

    // If all jobs failed, throw
    if (results.length === 0 && errors.size > 0) {
      const firstError = errors.values().next().value;
      throw firstError;
    }

    return results;
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

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
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
    };

    return {
      watermarkId,
      image: imageBuffer,
      metadata,
    };
  }

  /**
   * Validate a watermark input.
   */
  private validateInput(input: WatermarkInput): void {
    if (!input.image) {
      throw new ValidationError('Image is required', 'image');
    }

    if (!input.watermarkText) {
      throw new ValidationError('Watermark text is required', 'watermarkText');
    }

    if (input.watermarkText.length > 100) {
      throw new ValidationError(
        'Watermark text cannot exceed 100 characters',
        'watermarkText'
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
    
    const imageBlob = await prepareImage(input.image);
    formData.append('image', imageBlob, 'image');
    formData.append('watermarkText', input.watermarkText);

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
