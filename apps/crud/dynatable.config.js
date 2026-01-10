module.exports = {
  // DynamoDB table name
  tableName: "InstagramClone",

  // DynamoDB client configuration
  client: {
    region: "us-east-1",

    // For local DynamoDB
    endpoint: "http://localhost:8000",

    // Credentials for local
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  },

  // Migrations directory
  migrationsDir: "./migrations",

  // Tracking prefix in single table (default: _SCHEMA#VERSION)
  trackingPrefix: "_SCHEMA#VERSION",

  // GSI name for tracking (default: GSI1)
  gsi1Name: "GSI1",
};
