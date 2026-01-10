const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    endpoint: "http://localhost:8000",
    region: "us-east-1",
    credentials: { accessKeyId: "local", secretAccessKey: "local" }
  })
);

async function scan() {
  const result = await client.send(new ScanCommand({
    TableName: "InstagramClone",
    FilterExpression: "begins_with(PK, :pk)",
    ExpressionAttributeValues: { ":pk": "_SCHEMA" }
  }));

  console.log("\n📊 Migration records in DynamoDB:\n");
  if (!result.Items || result.Items.length === 0) {
    console.log("No migration records found.");
  } else {
    result.Items.forEach(item => {
      console.log(`PK: ${item.PK}`);
      console.log(`SK: ${item.SK}`);
      console.log(`Version: ${item.version || item.currentVersion || 'N/A'}`);
      console.log(`Status: ${item.status || 'pointer'}`);
      console.log('---');
    });
  }
}

scan().catch(console.error);
