---
sidebar_position: 1
---

# Installation

Get started with Dynatable in minutes.

## Prerequisites

- **Node.js**: Version 16 or higher
- **TypeScript**: Version 5.0 or higher (recommended)
- **AWS Account**: For DynamoDB access

## Install Dynatable

Install Dynatable using your preferred package manager:

```bash npm2yarn
npm install dynatable
```

## Install AWS SDK

Dynatable requires the AWS SDK v3 for DynamoDB:

```bash npm2yarn
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Install Zod (Optional but Recommended)

Dynatable uses Zod for runtime validation. It's automatically included as a dependency:

```bash npm2yarn
npm install zod
```

## Verify Installation

Create a simple test file to verify everything is working:

```typescript title="test-dynatable.ts"
import { Table } from 'dynatable';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

console.log('Dynatable installed successfully!');
```

Run the test:

```bash
npx ts-node test-dynatable.ts
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
  region: 'local',
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
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
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
