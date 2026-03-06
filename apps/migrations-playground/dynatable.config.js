module.exports = {
  tableName: "MigrationsPlayground",

  client: {
    region: "us-east-1",
    endpoint: "http://localhost:8100",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  },

  migrationsDir: "./migrations",
  trackingPrefix: "_SCHEMA#VERSION",
  gsi1Name: "GSI1",
};
