# @saferlayer/client

Official Node.js client for the [SaferLayer Watermark API](https://saferlayer.com).

Apply secure watermarks to images and PDFs with a simple API.

## Installation

```bash
npm install @saferlayer/client
```

Requires Node.js 18 or higher.

## Quick Start

```typescript
import SaferLayer from '@saferlayer/client';
import { writeFile } from 'fs/promises';

const client = new SaferLayer({
  apiKey: 'sl_live_...', // or set SAFERLAYER_API_KEY env var
});

// Watermark one or more files (images or PDFs)
const results = await client.watermarks.create({
  watermarks: [
    { file: './id-front.jpg', text: 'Submitted by Jane Doe for ACME Realty' },
    { file: './id-back.jpg', text: 'Submitted by Jane Doe for ACME Realty' },
    { file: './contract.pdf', text: 'Submitted by Jane Doe for ACME Realty' },
  ],
});

// Save the watermarked files
for (const result of results) {
  const ext = result.fileType === 'pdf' ? 'pdf' : 'png';
  await writeFile(`${result.watermarkId}.${ext}`, result.data);
}
```

## Usage

### Single File

```typescript
const [result] = await client.watermarks.create({
  watermarks: [
    {
      file: './document.jpg',         // File path, Buffer, or Blob
      text: 'Submitted by John Smith for ID verification only',
      skipFilters: ['isoline'],        // Optional: skip certain filters
    },
  ],
});

// result.watermarkId: string - unique ID for this job
// result.data: Buffer - the watermarked file (PNG for images, PDF for PDFs)
// result.fileType: 'image' | 'pdf'
// result.metadata.originalSize: { width, height }
// result.metadata.watermarkedSize: { width, height }
// result.metadata.processingTime: number (ms)
// result.metadata.pageCount: number (PDFs only)
```

### PDF Files

```typescript
const [result] = await client.watermarks.create({
  watermarks: [
    {
      file: './contract.pdf',
      text: 'DRAFT - For Review Only',
    },
  ],
});

console.log(`Processed ${result.metadata.pageCount} pages`);
await writeFile('contract_watermarked.pdf', result.data);
```

### Multiple Files

```typescript
const results = await client.watermarks.create({
  watermarks: [
    { file: './id-front.jpg', text: 'Submitted by Jane Doe for ACME Realty' },
    { file: './id-back.jpg', text: 'Submitted by Jane Doe for ACME Realty' },
    { file: buffer, text: 'Submitted by Jane Doe for ACME Realty' },
  ],
  onStatusChange: (id, status) => {
    console.log(`[${id}] ${status.status}`);
  },
  onComplete: (id, result) => {
    console.log(`[${id}] Done in ${result.metadata.processingTime}ms`);
  },
  onError: (id, error) => {
    console.log(`[${id}] Failed: ${error.message}`);
  },
});
```

### Health Check

```typescript
const health = await client.health.check();

console.log(health.data.status);           // 'healthy'
console.log(health.data.apiVersion);       // '1.0.0'
```

## CLI

The package includes a command-line tool:

```bash
# Install globally
npm install -g @saferlayer/client

# Or use npx
npx @saferlayer/client watermark image.jpg -t "CONFIDENTIAL"
```

### Commands

#### watermark

Apply watermark to one or more files (images or PDFs):

```bash
saferlayer watermark id-front.jpg id-back.jpg contract.pdf -t "Submitted by Jane Doe for ACME Realty"

# Options:
#   -t, --text <text>        Watermark text (required)
#   -o, --output <dir>       Output directory (default: current directory)
#   --skip-filters <list>    Filters to skip: isoline, bulge
#   --api-key <key>          API key (or use SAFERLAYER_API_KEY env var)
```

#### health

Check API status:

```bash
saferlayer health
```

## Configuration

### Client Options

```typescript
const client = new SaferLayer({
  // API key (required, unless SAFERLAYER_API_KEY is set)
  apiKey: 'sl_live_...',
  
  // Request timeout in ms (default: 300000 / 5 minutes)
  timeout: 300_000,
  
  // Max retries for 503/5xx errors (default: 3)
  maxRetries: 3,
});
```

## Error Handling

The client throws typed errors for different failure modes:

```typescript
import SaferLayer, {
  AuthenticationError,
  ValidationError,
  ServiceUnavailableError,
  TimeoutError,
  MaxRetriesExceededError,
} from '@saferlayer/client';

try {
  await client.watermarks.create({ ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Invalid or missing API key (401)
  } else if (error instanceof ValidationError) {
    // Invalid parameters (400)
    console.log(`Invalid field: ${error.field}`);
  } else if (error instanceof ServiceUnavailableError) {
    // Service overloaded (503) - auto-retries, but if still failing
    console.log(`Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof TimeoutError) {
    // Request timed out
    console.log(`Timed out after ${error.timeoutMs}ms`);
  } else if (error instanceof MaxRetriesExceededError) {
    // All retries failed
    console.log(`Failed after ${error.attempts} attempts`);
  }
}
```

## Filters

The watermarking process applies visual filters. You can optionally skip them:

| Filter | Description |
|--------|-------------|
| `isoline` | Black & white topographic/contour line effect |
| `bulge` | Bulge distortion effect on text |

```typescript
await client.watermarks.create({
  images: {
    image: file,
    watermarkText: 'TEXT',
    skipFilters: ['isoline', 'bulge'], // Skip all filters
  },
});
```

## TypeScript

Full type definitions included:

```typescript
import SaferLayer, {
  type WatermarkInput,
  type WatermarkOptions,
  type WatermarkResult,
  type FileType,
  type FilterName,
} from '@saferlayer/client';

const input: WatermarkInput = {
  file: buffer,
  text: 'TYPED',
  skipFilters: ['isoline'] satisfies FilterName[],
};

const results: WatermarkResult[] = await client.watermarks.create({
  watermarks: [input],
});

// Check file type
if (results[0].fileType === 'pdf') {
  console.log(`Processed ${results[0].metadata.pageCount} pages`);
}
```

## License

MIT © [Bytelantic](https://bytelantic.com)
