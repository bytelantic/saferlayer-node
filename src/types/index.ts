/**
 * Filter names that can be skipped during watermarking.
 */
export type FilterName = 'isoline' | 'bulge';

/**
 * Valid filter names array for validation.
 */
export const VALID_FILTER_NAMES: readonly FilterName[] = ['isoline', 'bulge'] as const;

/**
 * Image dimensions.
 */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Metadata returned after watermarking an image.
 */
export interface WatermarkMetadata {
  /** Original image dimensions */
  originalSize: ImageSize;
  /** Watermarked image dimensions */
  watermarkedSize: ImageSize;
  /** Processing time in milliseconds */
  processingTime: number;
}

/**
 * Options for a single image to watermark.
 */
export interface WatermarkInput {
  /**
   * Image file to watermark.
   * Can be a Buffer, File, Blob, or a path string (Node.js only).
   */
  image: Buffer | Blob | string;
  
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
  /** Watermarked image as a Buffer */
  image: Buffer;
  /** Image metadata */
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
   * API URL to connect to.
   * @default process.env.SAFERLAYER_API_URL || 'https://api.saferlayer.com'
   */
  apiUrl?: string;

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
