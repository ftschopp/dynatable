import { modelToZod, typeToZod } from './zod-utils';
import type { AttributeDefinition, ModelDefinition } from '../core/types';

describe('zod-utils', () => {
  describe('typeToZod', () => {
    it('should convert String type to z.string()', () => {
      const attr: AttributeDefinition = {
        type: String,
        required: true,
      };
      const zodType = typeToZod(attr);

      expect(() => zodType.parse('hello')).not.toThrow();
      expect(() => zodType.parse(123)).toThrow();
    });

    it('should convert Number type to z.number()', () => {
      const attr: AttributeDefinition = {
        type: Number,
        required: true,
      };
      const zodType = typeToZod(attr);

      expect(() => zodType.parse(42)).not.toThrow();
      expect(() => zodType.parse('42')).toThrow();
    });

    it('should convert Boolean type to z.boolean()', () => {
      const attr: AttributeDefinition = {
        type: Boolean,
        required: true,
      };
      const zodType = typeToZod(attr);

      expect(() => zodType.parse(true)).not.toThrow();
      expect(() => zodType.parse(false)).not.toThrow();
      expect(() => zodType.parse('true')).toThrow();
    });

    it('should convert Date type to z.date()', () => {
      const attr: AttributeDefinition = {
        type: Date,
        required: true,
      };
      const zodType = typeToZod(attr);

      const now = new Date();
      expect(() => zodType.parse(now)).not.toThrow();
      expect(() => zodType.parse('2024-01-01')).toThrow();
    });

    it('should make optional fields when required is false', () => {
      const attr: AttributeDefinition = {
        type: String,
        required: false,
      };
      const zodType = typeToZod(attr);

      expect(() => zodType.parse('hello')).not.toThrow();
      expect(() => zodType.parse(undefined)).not.toThrow();
    });

    it('should make required fields when required is true', () => {
      const attr: AttributeDefinition = {
        type: String,
        required: true,
      };
      const zodType = typeToZod(attr);

      expect(() => zodType.parse('hello')).not.toThrow();
      expect(() => zodType.parse(undefined)).toThrow();
    });

    it('should return z.unknown() for unknown types', () => {
      const attr: AttributeDefinition = {
        type: Array as any,
        required: true,
      };
      const zodType = typeToZod(attr);

      // z.unknown() accepts any value
      expect(() => zodType.parse('anything')).not.toThrow();
      expect(() => zodType.parse(123)).not.toThrow();
      expect(() => zodType.parse([])).not.toThrow();
    });
  });

  describe('modelToZod', () => {
    it('should convert a simple model to Zod schema', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'PROFILE' },
        },
        attributes: {
          id: { type: String, required: true },
          name: { type: String, required: true },
          age: { type: Number, required: false },
        },
      };

      const zodSchema = modelToZod(model);

      const validData = {
        id: 'user-123',
        name: 'John Doe',
        age: 30,
      };

      expect(() => zodSchema.parse(validData)).not.toThrow();
    });

    it('should allow optional fields to be missing', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'PROFILE' },
        },
        attributes: {
          id: { type: String, required: true },
          email: { type: String, required: false },
        },
      };

      const zodSchema = modelToZod(model);

      const dataWithoutOptional = {
        id: 'user-123',
      };

      expect(() => zodSchema.parse(dataWithoutOptional)).not.toThrow();
    });

    it('should reject missing required fields', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'PROFILE' },
        },
        attributes: {
          id: { type: String, required: true },
          name: { type: String, required: true },
        },
      };

      const zodSchema = modelToZod(model);

      const invalidData = {
        id: 'user-123',
        // name is missing
      };

      expect(() => zodSchema.parse(invalidData)).toThrow();
    });

    it('should use passthrough to allow additional fields', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'PROFILE' },
        },
        attributes: {
          id: { type: String, required: true },
        },
      };

      const zodSchema = modelToZod(model);

      const dataWithExtraFields = {
        id: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        someOtherField: 'value',
      };

      // Should not throw because of passthrough mode
      expect(() => zodSchema.parse(dataWithExtraFields)).not.toThrow();
    });

    it('should handle complex models with multiple types', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'PRODUCT#${id}' },
          SK: { type: String, value: 'DETAILS' },
        },
        attributes: {
          id: { type: String, required: true },
          name: { type: String, required: true },
          price: { type: Number, required: true },
          available: { type: Boolean, required: false },
          releaseDate: { type: Date, required: false },
        },
      };

      const zodSchema = modelToZod(model);

      const validProduct = {
        id: 'prod-123',
        name: 'Laptop',
        price: 999.99,
        available: true,
        releaseDate: new Date('2024-01-01'),
      };

      expect(() => zodSchema.parse(validProduct)).not.toThrow();
    });

    it('should reject wrong types', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'PROFILE' },
        },
        attributes: {
          id: { type: String, required: true },
          age: { type: Number, required: true },
        },
      };

      const zodSchema = modelToZod(model);

      const invalidData = {
        id: 'user-123',
        age: '30', // Wrong type: string instead of number
      };

      expect(() => zodSchema.parse(invalidData)).toThrow();
    });

    it('should handle empty models', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'EMPTY#${id}' },
          SK: { type: String, value: 'ITEM' },
        },
        attributes: {},
      };

      const zodSchema = modelToZod(model);

      expect(() => zodSchema.parse({})).not.toThrow();
      // Passthrough allows any fields
      expect(() => zodSchema.parse({ anyField: 'value' })).not.toThrow();
    });

    it('should validate parsed data correctly', () => {
      const model: ModelDefinition = {
        key: {
          PK: { type: String, value: 'USER#${id}' },
          SK: { type: String, value: 'PROFILE' },
        },
        attributes: {
          id: { type: String, required: true },
          count: { type: Number, required: true },
        },
      };

      const zodSchema = modelToZod(model);

      const data = {
        id: 'user-123',
        count: 42,
        extra: 'allowed',
      };

      const parsed = zodSchema.parse(data);
      expect(parsed.id).toBe('user-123');
      expect(parsed.count).toBe(42);
      expect(parsed.extra).toBe('allowed');
    });
  });
});
