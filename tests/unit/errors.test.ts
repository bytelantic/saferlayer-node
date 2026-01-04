import { describe, it, expect } from 'vitest';
import {
  SaferLayerError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ServiceUnavailableError,
  NotReadyError,
  TimeoutError,
  MaxRetriesExceededError,
  parseErrorResponse,
} from '../../src/errors/index.js';

describe('Error Classes', () => {
  describe('SaferLayerError', () => {
    it('has correct name and message', () => {
      const error = new SaferLayerError('Something went wrong');
      expect(error.name).toBe('SaferLayerError');
      expect(error.message).toBe('Something went wrong');
    });

    it('has optional status code', () => {
      const error = new SaferLayerError('Error with status', 500);
      expect(error.status).toBe(500);
    });

    it('has optional cause', () => {
      const cause = new Error('Original error');
      const error = new SaferLayerError('Wrapped error', undefined, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('AuthenticationError', () => {
    it('has status 401', () => {
      const error = new AuthenticationError();
      expect(error.status).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });

    it('has default message', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Invalid or missing API key');
    });

    it('accepts custom message', () => {
      const error = new AuthenticationError('Custom auth error');
      expect(error.message).toBe('Custom auth error');
    });
  });

  describe('ValidationError', () => {
    it('has status 400', () => {
      const error = new ValidationError('Invalid input');
      expect(error.status).toBe(400);
      expect(error.name).toBe('ValidationError');
    });

    it('has optional field property', () => {
      const error = new ValidationError('Text too long', 'text');
      expect(error.field).toBe('text');
    });

    it('field is undefined when not provided', () => {
      const error = new ValidationError('Invalid input');
      expect(error.field).toBeUndefined();
    });
  });

  describe('NotFoundError', () => {
    it('has status 404', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.status).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });

    it('has optional resource and resourceId', () => {
      const error = new NotFoundError('Watermark not found', 'watermark', 'wm_123');
      expect(error.resource).toBe('watermark');
      expect(error.resourceId).toBe('wm_123');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('has status 503', () => {
      const error = new ServiceUnavailableError();
      expect(error.status).toBe(503);
      expect(error.name).toBe('ServiceUnavailableError');
    });

    it('has retryAfter property with default value', () => {
      const error = new ServiceUnavailableError();
      expect(error.retryAfter).toBe(30);
    });

    it('accepts custom retryAfter value', () => {
      const error = new ServiceUnavailableError('Overloaded', 60);
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('NotReadyError', () => {
    it('has status 409', () => {
      const error = new NotReadyError();
      expect(error.status).toBe(409);
      expect(error.name).toBe('NotReadyError');
    });

    it('has currentStatus property with default value', () => {
      const error = new NotReadyError();
      expect(error.currentStatus).toBe('processing');
    });

    it('accepts custom currentStatus', () => {
      const error = new NotReadyError('Not ready', 'queued');
      expect(error.currentStatus).toBe('queued');
    });
  });

  describe('TimeoutError', () => {
    it('has name TimeoutError', () => {
      const error = new TimeoutError('Timed out', 5000);
      expect(error.name).toBe('TimeoutError');
    });

    it('has timeoutMs property', () => {
      const error = new TimeoutError('Timed out', 30000);
      expect(error.timeoutMs).toBe(30000);
    });
  });

  describe('MaxRetriesExceededError', () => {
    it('has name MaxRetriesExceededError', () => {
      const error = new MaxRetriesExceededError('Failed', 3);
      expect(error.name).toBe('MaxRetriesExceededError');
    });

    it('has attempts property', () => {
      const error = new MaxRetriesExceededError('Failed after 4 attempts', 4);
      expect(error.attempts).toBe(4);
    });
  });
});

describe('parseErrorResponse', () => {
  it('throws ValidationError for 400 status', async () => {
    const response = new Response(JSON.stringify({ error: 'Invalid input' }), {
      status: 400,
      statusText: 'Bad Request',
    });

    try {
      await parseErrorResponse(response);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).message).toBe('Invalid input');
    }
  });

  it('throws AuthenticationError for 401 status', async () => {
    const response = new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(parseErrorResponse(response)).rejects.toThrow(AuthenticationError);
  });

  it('throws NotFoundError for 404 status', async () => {
    const response = new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      statusText: 'Not Found',
    });

    await expect(parseErrorResponse(response)).rejects.toThrow(NotFoundError);
  });

  it('throws NotReadyError for 409 status', async () => {
    const response = new Response(JSON.stringify({ error: 'Not ready' }), {
      status: 409,
      statusText: 'Conflict',
    });

    await expect(parseErrorResponse(response)).rejects.toThrow(NotReadyError);
  });

  it('throws ServiceUnavailableError for 503 status', async () => {
    const response = new Response(JSON.stringify({ error: 'Overloaded' }), {
      status: 503,
      statusText: 'Service Unavailable',
    });

    await expect(parseErrorResponse(response)).rejects.toThrow(ServiceUnavailableError);
  });

  it('includes retryAfter in ServiceUnavailableError', async () => {
    const response = new Response(JSON.stringify({ error: 'Overloaded' }), {
      status: 503,
      statusText: 'Service Unavailable',
    });

    try {
      await parseErrorResponse(response, 45);
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceUnavailableError);
      expect((e as ServiceUnavailableError).retryAfter).toBe(45);
    }
  });

  it('throws SaferLayerError for unknown status codes', async () => {
    const response = new Response(JSON.stringify({ error: 'Unknown' }), {
      status: 418,
      statusText: "I'm a teapot",
    });

    await expect(parseErrorResponse(response)).rejects.toThrow(SaferLayerError);
    await expect(parseErrorResponse(response)).rejects.not.toThrow(ValidationError);
  });

  it('uses statusText when body is not JSON', async () => {
    const response = new Response('Not JSON content', {
      status: 500,
      statusText: 'Internal Server Error',
    });

    try {
      await parseErrorResponse(response);
    } catch (e) {
      expect(e).toBeInstanceOf(SaferLayerError);
      expect((e as SaferLayerError).message).toBe('Internal Server Error');
    }
  });

  it('uses message field from response body if error field is missing', async () => {
    const response = new Response(JSON.stringify({ message: 'Error from message field' }), {
      status: 400,
      statusText: 'Bad Request',
    });

    await expect(parseErrorResponse(response)).rejects.toThrow('Error from message field');
  });

  it('includes status code in SaferLayerError', async () => {
    const response = new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      statusText: 'Internal Server Error',
    });

    try {
      await parseErrorResponse(response);
    } catch (e) {
      expect(e).toBeInstanceOf(SaferLayerError);
      expect((e as SaferLayerError).status).toBe(500);
    }
  });
});
