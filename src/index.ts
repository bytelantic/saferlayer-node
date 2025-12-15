// Main client
export { SaferLayerClient, SaferLayerClient as default } from './client.js';

// Types
export type {
  // Options
  SaferLayerClientOptions,
  RequestOptions,
  WatermarkInput,
  WatermarkOptions,
  
  // Results
  WatermarkResult,
  WatermarkStatus,
  WatermarkMetadata,
  HealthCheckResponse,
  
  // Enums/Unions
  FilterName,
  WatermarkJobStatus,
  ImageSize,
} from './types/index.js';

export { VALID_FILTER_NAMES } from './types/index.js';

// Errors
export {
  SaferLayerError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ServiceUnavailableError,
  NotReadyError,
  TimeoutError,
  MaxRetriesExceededError,
} from './errors/index.js';

// Resources (for advanced usage)
export { Watermarks } from './resources/watermarks.js';
export { Health } from './resources/health.js';
