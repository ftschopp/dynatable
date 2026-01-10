#!/usr/bin/env node

/**
 * DynamoDB Migration CLI
 * Executable entry point
 */

// Register ts-node for TypeScript support in development
const path = require('path');
const fs = require('fs');

// Check if we're running from source (development) or compiled (production)
const sourceFile = path.join(__dirname, '../src/cli.ts');
const compiledFile = path.join(__dirname, '../dist/cli.js');

if (fs.existsSync(compiledFile)) {
  // Production: use compiled JavaScript
  require(compiledFile);
} else if (fs.existsSync(sourceFile)) {
  // Development: use ts-node to run TypeScript directly
  require('ts-node').register({
    project: path.join(__dirname, '../tsconfig.json'),
    transpileOnly: true,
  });
  require(sourceFile);
} else {
  console.error('Error: CLI files not found. Please build the project first.');
  console.error('Run: npm run build');
  process.exit(1);
}
