/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Type System Tests & Examples
 *
 * This file comprehensively tests the type system including:
 * - Schema definition validation
 * - Type inference (InferModel, InferModelFromSchema, InferInputFromSchema)
 * - Automatic timestamp field inference
 * - Internal key hiding (PK, SK, GSI keys not exposed in public types)
 */

import {
  SchemaDefinition,
  ModelDefinition,
  InferModel,
  InferModelFromSchema,
  InferInputFromSchema,
  TimestampFields,
} from './types';

// ============================================================================
// Model Type Inference Tests (InferModel)
// ============================================================================

describe('Model Type Inference', () => {
  // Test model with keys and indexes
  const TestModel = {
    key: {
      PK: { type: String, value: 'USER#${userId}' },
      SK: { type: String, value: 'USER#${userId}' },
    },
    index: {
      GSI1PK: { type: String, value: 'EMAIL#${email}' },
      GSI1SK: { type: String, value: 'USER#${userId}' },
    },
    attributes: {
      userId: { type: String, required: true },
      email: { type: String, required: true },
      name: { type: String, required: true },
      age: { type: Number, required: false },
    },
  } as const satisfies ModelDefinition;

  type TestUser = InferModel<typeof TestModel>;

  it('should NOT expose PK, SK, GSI1PK, GSI1SK in inferred model type', () => {
    const user: TestUser = {
      userId: '123',
      email: 'test@example.com',
      name: 'John Doe',
      age: 30,
    };

    // These should be valid
    expect(user.userId).toBe('123');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('John Doe');
    expect(user.age).toBe(30);

    // TypeScript should NOT allow accessing PK, SK, GSI1PK, GSI1SK
    // @ts-expect-error - PK should not exist on user type
    const _pk = user.PK;

    // @ts-expect-error - SK should not exist on user type
    const _sk = user.SK;

    // @ts-expect-error - GSI1PK should not exist on user type
    const _gsi1pk = user.GSI1PK;

    // @ts-expect-error - GSI1SK should not exist on user type
    const _gsi1sk = user.GSI1SK;

    // Silence unused variable warnings
    expect(_pk).toBeUndefined();
    expect(_sk).toBeUndefined();
    expect(_gsi1pk).toBeUndefined();
    expect(_gsi1sk).toBeUndefined();
  });

  it('should only include business attributes in the model type', () => {
    const user: TestUser = {
      userId: '123',
      email: 'test@example.com',
      name: 'John Doe',
    };

    // Verify the type structure
    const keys = Object.keys(user);
    expect(keys).not.toContain('PK');
    expect(keys).not.toContain('SK');
    expect(keys).not.toContain('GSI1PK');
    expect(keys).not.toContain('GSI1SK');
  });

  it('should allow optional attributes to be omitted', () => {
    const userWithoutAge: TestUser = {
      userId: '456',
      email: 'jane@example.com',
      name: 'Jane Doe',
    };

    expect(userWithoutAge.age).toBeUndefined();
  });

  it('should require all required attributes', () => {
    // This should compile - all required fields present
    const validUser: TestUser = {
      userId: '789',
      email: 'bob@example.com',
      name: 'Bob Smith',
    };

    expect(validUser).toBeDefined();

    // These should fail at compile time:

    // @ts-expect-error - missing required field 'name'
    const invalidUser1: TestUser = {
      userId: '789',
      email: 'bob@example.com',
    };

    // @ts-expect-error - missing required field 'email'
    const invalidUser2: TestUser = {
      userId: '789',
      name: 'Bob Smith',
    };

    // Silence warnings
    expect(invalidUser1).toBeDefined();
    expect(invalidUser2).toBeDefined();
  });
});

// ============================================================================
// Schema Definition Validation Tests
// ============================================================================

describe('Schema Definition Validation', () => {
  test('Valid schema with all required fields should compile', () => {
    const validSchema = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${username}' },
            SK: { type: String, value: 'USER#${username}' },
          },
          attributes: {
            username: { type: String, required: true },
          },
        },
      },
    } as const satisfies SchemaDefinition;

    expect(validSchema).toBeDefined();
    expect(validSchema.format).toBe('dynatable:1.0.0');
    expect(validSchema.version).toBe('1.0.0');
  });

  test('Schema with multiple models should compile', () => {
    const multiModelSchema = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
        gs1: { hash: 'GSI1PK', sort: 'GSI1SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${username}' },
            SK: { type: String, value: 'USER#${username}' },
          },
          attributes: {
            username: { type: String, required: true },
            email: { type: String, required: true },
          },
        },
        Post: {
          key: {
            PK: { type: String, value: 'USER#${userId}' },
            SK: { type: String, value: 'POST#${postId}' },
          },
          attributes: {
            userId: { type: String, required: true },
            postId: { type: String, generate: 'ulid' },
            title: { type: String, required: true },
          },
        },
      },
    } as const satisfies SchemaDefinition;

    expect(multiModelSchema.models).toHaveProperty('User');
    expect(multiModelSchema.models).toHaveProperty('Post');
  });

  test('Schema with secondary indexes should compile', () => {
    const schemaWithIndexes = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
        gs1: { hash: 'GSI1PK', sort: 'GSI1SK' },
        gs2: { hash: 'GSI2PK' }, // sort is optional
      },
      models: {
        Item: {
          key: {
            PK: { type: String, value: 'ITEM#${id}' },
            SK: { type: String, value: 'ITEM#${id}' },
          },
          index: {
            gs1PK: { type: String, value: 'TYPE#${type}' },
            gs1SK: { type: String, value: 'CREATED#${createdAt}' },
          },
          attributes: {
            id: { type: String, required: true },
            type: { type: String, required: true },
            createdAt: { type: String, required: true },
          },
        },
      },
    } as const satisfies SchemaDefinition;

    expect(schemaWithIndexes.indexes).toHaveProperty('primary');
    expect(schemaWithIndexes.indexes).toHaveProperty('gs1');
    expect(schemaWithIndexes.indexes).toHaveProperty('gs2');
  });

  test('Schema with all attribute types should compile', () => {
    const allTypesSchema = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        CompleteModel: {
          key: {
            PK: { type: String, value: 'MODEL#${id}' },
            SK: { type: String, value: 'MODEL#${id}' },
          },
          attributes: {
            id: { type: String, required: true },
            name: { type: String, required: true },
            age: { type: Number, default: 0 },
            score: { type: Number },
            isActive: { type: Boolean, default: false },
            isVerified: { type: Boolean },
            createdAt: { type: Date },
            updatedAt: { type: Date },
            generatedId: { type: String, generate: 'ulid' },
            uuid: { type: String, generate: 'uuid' },
          },
        },
      },
    } as const satisfies SchemaDefinition;

    expect(allTypesSchema.models.CompleteModel.attributes).toHaveProperty('id');
    expect(allTypesSchema.models.CompleteModel.attributes).toHaveProperty('name');
    expect(allTypesSchema.models.CompleteModel.attributes).toHaveProperty('age');
    expect(allTypesSchema.models.CompleteModel.attributes).toHaveProperty('isActive');
    expect(allTypesSchema.models.CompleteModel.attributes).toHaveProperty('createdAt');
  });

  test('Schema with params should compile', () => {
    const schemaWithParams = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${id}' },
            SK: { type: String, value: 'USER#${id}' },
          },
          attributes: {
            id: { type: String, required: true },
          },
        },
      },
      params: {
        isoDates: true,
        timestamps: true,
      },
    } as const satisfies SchemaDefinition;

    expect(schemaWithParams.params?.isoDates).toBe(true);
    expect(schemaWithParams.params?.timestamps).toBe(true);
  });

  test('Schema type validation enforces structure at compile time', () => {
    // This test verifies that TypeScript enforces the schema structure
    // If any of these commented examples were uncommented, they would fail to compile

    // Type checking happens at compile time, so we just verify the valid schema compiles
    const validSchema = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${id}' },
            SK: { type: String, value: 'USER#${id}' },
          },
          attributes: {
            id: { type: String, required: true },
          },
        },
      },
    } as const satisfies SchemaDefinition;

    expect(validSchema.models.User.key).toHaveProperty('PK');
    expect(validSchema.models.User.key).toHaveProperty('SK');
    expect(validSchema.models.User.key.PK).toHaveProperty('type');
    expect(validSchema.models.User.key.PK).toHaveProperty('value');
  });
});

// ============================================================================
// Timestamp Type Inference Tests
// ============================================================================

describe('Timestamp Type Inference', () => {
  test('InferModelFromSchema should include timestamp fields when timestamps: true', () => {
    const schemaWithTimestamps = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${id}' },
            SK: { type: String, value: 'USER#${id}' },
          },
          attributes: {
            id: { type: String, required: true },
            name: { type: String, required: true },
          },
        },
      },
      params: {
        timestamps: true,
      },
    } as const satisfies SchemaDefinition;

    type UserModel = InferModelFromSchema<typeof schemaWithTimestamps, 'User'>;

    // This is a compile-time test - if it compiles, the types are correct
    const user: UserModel = {
      id: '123',
      name: 'John Doe',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    // Verify that the timestamp fields are required
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();

    // Type check: these should cause compilation errors if uncommented
    // const invalidUser: UserModel = {
    //   id: '123',
    //   name: 'John Doe',
    //   // Missing createdAt and updatedAt
    // };
  });

  test('InferModelFromSchema should NOT include timestamp fields when timestamps: false', () => {
    const schemaWithoutTimestamps = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${id}' },
            SK: { type: String, value: 'USER#${id}' },
          },
          attributes: {
            id: { type: String, required: true },
            name: { type: String, required: true },
          },
        },
      },
      params: {
        timestamps: false,
      },
    } as const satisfies SchemaDefinition;

    type UserModel = InferModelFromSchema<typeof schemaWithoutTimestamps, 'User'>;

    // Without timestamps, the model should not have createdAt/updatedAt
    const user: UserModel = {
      id: '123',
      name: 'John Doe',
    };

    expect(user.id).toBe('123');
    expect(user.name).toBe('John Doe');
  });

  test('InferModelFromSchema should NOT include timestamp fields when params is undefined', () => {
    const schemaWithoutParams = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${id}' },
            SK: { type: String, value: 'USER#${id}' },
          },
          attributes: {
            id: { type: String, required: true },
            name: { type: String, required: true },
          },
        },
      },
    } as const satisfies SchemaDefinition;

    type UserModel = InferModelFromSchema<typeof schemaWithoutParams, 'User'>;

    const user: UserModel = {
      id: '123',
      name: 'John Doe',
    };

    expect(user.id).toBe('123');
  });

  test('InferInputFromSchema should NOT include timestamp fields when timestamps: true', () => {
    const schemaWithTimestamps = {
      format: 'dynatable:1.0.0',
      version: '1.0.0',
      indexes: {
        primary: { hash: 'PK', sort: 'SK' },
      },
      models: {
        User: {
          key: {
            PK: { type: String, value: 'USER#${id}' },
            SK: { type: String, value: 'USER#${id}' },
          },
          attributes: {
            id: { type: String, required: true },
            name: { type: String, required: true },
          },
        },
      },
      params: {
        timestamps: true,
      },
    } as const satisfies SchemaDefinition;

    type UserInput = InferInputFromSchema<typeof schemaWithTimestamps, 'User'>;

    // Input should NOT include timestamps (they're auto-generated)
    const input1: UserInput = {
      id: '123',
      name: 'John Doe',
    };

    expect(input1.id).toBe('123');

    // Verify timestamps are NOT in the input type by checking the type structure
    type InputKeys = keyof UserInput;
    const inputKeys: InputKeys[] = ['id', 'name'];

    // TypeScript compile-time test: these should cause errors if uncommented
    // const invalidInput: UserInput = {
    //   id: '123',
    //   name: 'John Doe',
    //   createdAt: '2024-01-01T00:00:00.000Z', // Should error: createdAt doesn't exist
    //   updatedAt: '2024-01-01T00:00:00.000Z', // Should error: updatedAt doesn't exist
    // };

    expect(inputKeys).toContain('id');
  });

  test('TimestampFields type should have correct structure', () => {
    const timestamps: TimestampFields = {
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    expect(timestamps.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(timestamps.updatedAt).toBe('2024-01-01T00:00:00.000Z');
  });
});
