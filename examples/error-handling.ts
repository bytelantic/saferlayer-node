/**
 * Example: Error handling
 * 
 * Demonstrates how to handle different error types.
 * 
 * Run with:
 *   SAFERLAYER_API_KEY=sl_live_... npx tsx examples/error-handling.ts
 */
import SaferLayer, {
  AuthenticationError,
  ValidationError,
  ServiceUnavailableError,
  TimeoutError,
  MaxRetriesExceededError,
  SaferLayerError,
} from '../src/index.js';

async function main() {
  const client = new SaferLayer();

  try {
    await client.watermarks.create({
      watermarks: [
        {
          image: './test-image.jpg',
          text: 'Submitted by John Smith for ID verification only',
        },
      ],
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      // Invalid or missing API key (401)
      console.log('Authentication failed:', error.message);
    } else if (error instanceof ValidationError) {
      // Invalid parameters (400)
      console.log('Validation failed:', error.message);
      console.log('Field:', error.field);
    } else if (error instanceof ServiceUnavailableError) {
      // Service overloaded (503) - will auto-retry, but if still failing:
      console.log('Service busy, retry after:', error.retryAfter, 'seconds');
    } else if (error instanceof TimeoutError) {
      // Request timed out (5 min default)
      console.log('Timed out after:', error.timeoutMs, 'ms');
    } else if (error instanceof MaxRetriesExceededError) {
      // All retries failed
      console.log('Max retries exceeded:', error.attempts);
    } else if (error instanceof SaferLayerError) {
      // Other API errors
      console.log('API error:', error.message, `(${error.status})`);
    } else {
      // Unexpected error
      throw error;
    }
  }
}

main().catch(console.error);
