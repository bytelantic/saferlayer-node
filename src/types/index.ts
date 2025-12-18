/**
 * Filter names that can be skipped during watermarking.
 */
export type FilterName = 'isoline' | 'bulge';

/**
 * Valid filter names array for validation.
 */
export const VALID_FILTER_NAMES: readonly FilterName[] = ['isoline', 'bulge'] as const;

/**
 * Supported file types for watermarking.
 */
export type FileType = 'image' | 'pdf';

/**
 * Image dimensions.
 */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Metadata returned after watermarking a file.
 */
export interface WatermarkMetadata {
  /** Original image/page dimensions */
  originalSize: ImageSize;
  /** Watermarked image/page dimensions */
  watermarkedSize: ImageSize;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Number of pages (PDF only) */
  pageCount?: number;
}

/**
 * Options for a single file to watermark.
 */
export interface WatermarkInput {
  /**
   * File to watermark (image or PDF).
   * Can be a Buffer, File, Blob, or a path string (Node.js only).
   * Supported formats: JPEG, PNG, GIF, WebP, PDF
   */
  file: Buffer | Blob | string;
  
  /**
   * @deprecated Use `file` instead. Alias for backward compatibility.
   */
  image?: Buffer | Blob | string;
  
  /**
   * Text to display as watermark.
   * @maxLength 100
   */
  text: string;
  
  /**
   * Filters to skip during processing.
   * @example ['isoline'] or ['isoline', 'bulge']
   */
  skipFilters?: FilterName[];
}

/**
 * Options for watermark batch processing.
 */
export interface WatermarkOptions {
  /**
   * Array of watermarks to create.
   */
  watermarks: WatermarkInput[];
  
  /**
   * Callback fired when a job's status changes.
   * @param watermarkId - The watermark job ID
   * @param status - The current status
   * @param index - The index of the image in the input array
   */
  onStatusChange?: (watermarkId: string, status: WatermarkStatus, index: number) => void;
  
  /**
   * Callback fired when a job completes.
   * @param watermarkId - The watermark job ID
   * @param result - The completed watermark result
   * @param index - The index of the image in the input array
   */
  onComplete?: (watermarkId: string, result: WatermarkResult, index: number) => void | Promise<void>;
  
  /**
   * Callback fired when a job fails.
   * @param watermarkId - The watermark job ID
   * @param error - The error that occurred
   * @param index - The index of the image in the input array
   */
  onError?: (watermarkId: string, error: Error, index: number) => void;
}

/**
 * Watermark job status values.
 */
export type WatermarkJobStatus = 'queued' | 'processing' | 'completed' | 'downloading' | 'failed';

/**
 * Status response from the async watermark endpoint.
 */
export interface WatermarkStatus {
  /** Whether the request was successful */
  success: boolean;
  /** Unique identifier for the watermark job */
  watermarkId: string;
  /** Current status of the job */
  status: WatermarkJobStatus;
  /** Internal job state */
  state?: string;
  /** Result data (only present when status is 'completed') */
  result?: {
    outputObjectKey: string;
    metadata: WatermarkMetadata;
  };
  /** Error info (only present when status is 'failed') */
  error?: {
    message: string;
    statusCode: number;
  };
}

/**
 * Result from a successful watermark operation.
 */
export interface WatermarkResult {
  /** Unique identifier for the watermark job */
  watermarkId: string;
  /** Watermarked file as a Buffer (image or PDF) */
  data: Buffer;
  /**
   * @deprecated Use `data` instead. Alias for backward compatibility.
   */
  image: Buffer;
  /** Type of file that was processed */
  fileType: FileType;
  /** File metadata */
  metadata: WatermarkMetadata;
}

/**
 * Response from the health check endpoint.
 */
export interface HealthCheckResponse {
  success: boolean;
  data: {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    apiVersion: string;
    saferlayerVersion: string;
    service: string;
  };
}

/**
 * Client configuration options.
 */
export interface SaferLayerClientOptions {
  /**
   * API key for authentication.
   * Format: sl_live_[64 hexadecimal characters]
   * @default process.env.SAFERLAYER_API_KEY
   */
  apiKey?: string;

  /**
   * Base URL for the API.
   * Useful for local development or custom deployments.
   * @default process.env.SAFERLAYER_API_URL ?? 'https://api.saferlayer.com'
   */
  baseUrl?: string;
  
  /**
   * Request timeout in milliseconds.
   * @default 300000 (5 minutes)
   */
  timeout?: number;
  
  /**
   * Maximum number of retries for failed requests.
   * Applies to 503 and 5xx errors.
   * @default 3
   */
  maxRetries?: number;
}

/**
 * Options for individual requests (overrides client defaults).
 */
export interface RequestOptions {
  /** Override max retries for this request */
  maxRetries?: number;
  /** Override timeout for this request */
  timeout?: number;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}
