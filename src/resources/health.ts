import type { HealthCheckResponse, RequestOptions } from '../types/index.js';
import type { SaferLayerClient } from '../client.js';

/**
 * Resource for checking API health status.
 */
export class Health {
  constructor(private readonly client: SaferLayerClient) {}

  /**
   * Check the health status of the API.
   * Does not require authentication.
   *
   * @example
   * ```typescript
   * const health = await client.health.check();
   *
   * console.log(health.data.status); // 'healthy'
   * console.log(health.data.apiVersion); // '1.0.0'
   * ```
   */
  async check(requestOptions?: RequestOptions): Promise<HealthCheckResponse> {
    return await this.client.requestPublic<HealthCheckResponse>(
      'GET',
      '/api/health',
      requestOptions
    );
  }
}
