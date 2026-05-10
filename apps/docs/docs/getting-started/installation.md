---
sidebar_position: 1
---

# Installation

Get started with Dynatable in minutes.

## Prerequisites

- **Node.js**: Version 22 or higher
- **TypeScript**: Version 5.0 or higher (recommended)
- **AWS Account**: For DynamoDB access

## Install Dynatable

Install Dynatable using your preferred package manager:

```bash npm2yarn
npm install @ftschopp/dynatable-core
```


## Verify Installation

Create a simple test file to verify everything is working:

```typescript title="test-dynatable.ts"
import { Table } from '@ftschopp/dynatable-core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

console.log('Dynatable installed successfully!');
```

Run the test (Node 22+ supports TypeScript natively via `--experimental-strip-types`; `tsx` is a popular alternative):

```bash
node --experimental-strip-types test-dynatable.ts
# or: npx tsx test-dynatable.ts
```

## AWS Configuration

### Local Development

For local development, you can use DynamoDB Local or configure AWS credentials:

#### Option 1: DynamoDB Local

Install and run DynamoDB Local using Docker:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

Configure your client to use the local endpoint:

```typescript
const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  },
});
```

#### Option 2: AWS Credentials

Configure AWS credentials using one of these methods:

**Environment Variables:**

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

**AWS Credentials File** (`~/.aws/credentials`):

```ini
[default]
aws_access_key_id = your-access-key
aws_secret_access_key = your-secret-key
```

**AWS Config File** (`~/.aws/config`) — region goes here, not in `credentials`:

```ini
[default]
region = us-east-1
```

**Using AWS CLI:**

```bash
aws configure
```

### Production

For production environments, use IAM roles or environment variables:

```typescript
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  // Credentials are automatically picked up from IAM role
});
```

## TypeScript Configuration

Ensure your `tsconfig.json` has these settings for optimal type inference:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

:::tip
The `strict` flag is highly recommended for better type safety with Dynatable.
:::

## Next Steps

Now that you have Dynatable installed, let's create your first table:

- **[Quick Start](./quick-start)** - Create your first table and perform basic operations
- **[Schema Definition](./schema-basics)** - Learn how to define your data models
