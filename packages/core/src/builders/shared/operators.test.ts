import { createOpBuilder } from './operators';

describe('OpBuilder Counter Isolation', () => {
  it('should have isolated counters for each opBuilder instance', () => {
    const op1 = createOpBuilder();
    const op2 = createOpBuilder();

    const attr = { name: 'username' };

    // Create conditions with both builders
    const cond1a = op1.eq(attr, 'alice');
    const cond1b = op1.eq(attr, 'bob');

    const cond2a = op2.eq(attr, 'charlie');
    const cond2b = op2.eq(attr, 'dave');

    // Each builder should have its own counter starting at 0
    expect(cond1a.values).toEqual({ ':username_0': 'alice' });
    expect(cond1b.values).toEqual({ ':username_1': 'bob' });

    // Second builder should also start at 0
    expect(cond2a.values).toEqual({ ':username_0': 'charlie' });
    expect(cond2b.values).toEqual({ ':username_1': 'dave' });
  });

  it('should not share state between different builder instances', () => {
    const op1 = createOpBuilder();
    const op2 = createOpBuilder();

    const attr = { name: 'age' };

    // Use first builder
    op1.gt(attr, 18);
    op1.lt(attr, 65);

    // Second builder should start from 0, not continue from first
    const cond = op2.eq(attr, 25);
    expect(cond.values).toEqual({ ':age_0': 25 });
  });

  it('should generate unique names for multiple values in same condition', () => {
    const op = createOpBuilder();
    const attr = { name: 'score' };

    const between = op.between(attr, 10, 20);

    expect(between.values).toEqual({
      ':score_low_0': 10,
      ':score_high_1': 20,
    });
  });
});

describe('New Operators', () => {
  describe('contains operator', () => {
    it('should build contains expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'tags' };

      const condition = op.contains(attr, 'featured');

      expect(condition.expression).toBe('contains(#tags, :tags_0)');
      expect(condition.names).toEqual({ '#tags': 'tags' });
      expect(condition.values).toEqual({ ':tags_0': 'featured' });
    });
  });

  describe('exists operator', () => {
    it('should build attribute_exists expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'email' };

      const condition = op.exists(attr);

      expect(condition.expression).toBe('attribute_exists(#email)');
      expect(condition.names).toEqual({ '#email': 'email' });
      expect(condition.values).toBeUndefined();
    });
  });

  describe('notExists operator', () => {
    it('should build attribute_not_exists expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'deletedAt' };

      const condition = op.notExists(attr);

      expect(condition.expression).toBe('attribute_not_exists(#deletedAt)');
      expect(condition.names).toEqual({ '#deletedAt': 'deletedAt' });
      expect(condition.values).toBeUndefined();
    });
  });

  describe('attributeType operator', () => {
    it('should build attribute_type expression for String', () => {
      const op = createOpBuilder();
      const attr = { name: 'name' };

      const condition = op.attributeType(attr, 'S');

      expect(condition.expression).toBe('attribute_type(#name, :name_type_0)');
      expect(condition.names).toEqual({ '#name': 'name' });
      expect(condition.values).toEqual({ ':name_type_0': 'S' });
    });

    it('should build attribute_type expression for Number', () => {
      const op = createOpBuilder();
      const attr = { name: 'age' };

      const condition = op.attributeType(attr, 'N');

      expect(condition.expression).toBe('attribute_type(#age, :age_type_0)');
      expect(condition.names).toEqual({ '#age': 'age' });
      expect(condition.values).toEqual({ ':age_type_0': 'N' });
    });

    it('should build attribute_type expression for List', () => {
      const op = createOpBuilder();
      const attr = { name: 'items' };

      const condition = op.attributeType(attr, 'L');

      expect(condition.expression).toBe('attribute_type(#items, :items_type_0)');
      expect(condition.names).toEqual({ '#items': 'items' });
      expect(condition.values).toEqual({ ':items_type_0': 'L' });
    });
  });

  describe('in operator', () => {
    it('should build IN expression with multiple values', () => {
      const op = createOpBuilder();
      const attr = { name: 'status' };

      const condition = op.in(attr, ['active', 'pending', 'approved']);

      expect(condition.expression).toBe('#status IN (:status_in0_0, :status_in1_1, :status_in2_2)');
      expect(condition.names).toEqual({ '#status': 'status' });
      expect(condition.values).toEqual({
        ':status_in0_0': 'active',
        ':status_in1_1': 'pending',
        ':status_in2_2': 'approved',
      });
    });

    it('should build IN expression with single value', () => {
      const op = createOpBuilder();
      const attr = { name: 'category' };

      const condition = op.in(attr, ['books']);

      expect(condition.expression).toBe('#category IN (:category_in0_0)');
      expect(condition.names).toEqual({ '#category': 'category' });
      expect(condition.values).toEqual({
        ':category_in0_0': 'books',
      });
    });
  });

  describe('size operator', () => {
    it('should build size() = expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'tags' };

      const condition = op.size(attr).eq(5);

      expect(condition.expression).toBe('size(#tags) = :tags_size_0');
      expect(condition.names).toEqual({ '#tags': 'tags' });
      expect(condition.values).toEqual({ ':tags_size_0': 5 });
    });

    it('should build size() <> expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'items' };

      const condition = op.size(attr).ne(0);

      expect(condition.expression).toBe('size(#items) <> :items_size_0');
      expect(condition.names).toEqual({ '#items': 'items' });
      expect(condition.values).toEqual({ ':items_size_0': 0 });
    });

    it('should build size() < expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'name' };

      const condition = op.size(attr).lt(100);

      expect(condition.expression).toBe('size(#name) < :name_size_0');
      expect(condition.names).toEqual({ '#name': 'name' });
      expect(condition.values).toEqual({ ':name_size_0': 100 });
    });

    it('should build size() <= expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'description' };

      const condition = op.size(attr).lte(500);

      expect(condition.expression).toBe('size(#description) <= :description_size_0');
      expect(condition.names).toEqual({ '#description': 'description' });
      expect(condition.values).toEqual({ ':description_size_0': 500 });
    });

    it('should build size() > expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'password' };

      const condition = op.size(attr).gt(8);

      expect(condition.expression).toBe('size(#password) > :password_size_0');
      expect(condition.names).toEqual({ '#password': 'password' });
      expect(condition.values).toEqual({ ':password_size_0': 8 });
    });

    it('should build size() >= expression', () => {
      const op = createOpBuilder();
      const attr = { name: 'content' };

      const condition = op.size(attr).gte(10);

      expect(condition.expression).toBe('size(#content) >= :content_size_0');
      expect(condition.names).toEqual({ '#content': 'content' });
      expect(condition.values).toEqual({ ':content_size_0': 10 });
    });
  });

  describe('Combined operators', () => {
    it('should combine exists and other conditions with AND', () => {
      const op = createOpBuilder();
      const attr1 = { name: 'email' };
      const attr2 = { name: 'verified' };

      const condition = op.and(op.exists(attr1), op.eq(attr2, true));

      expect(condition.operator).toBe('AND');
      expect(condition.children).toBeDefined();
      expect(condition.children).toHaveLength(2);
      expect(condition.children![0]!.expression).toBe('attribute_exists(#email)');
      expect(condition.children![1]!.expression).toBe('#verified = :verified_0');
    });

    it('should combine size with comparison', () => {
      const op = createOpBuilder();
      const attr1 = { name: 'tags' };
      const attr2 = { name: 'status' };

      const condition = op.and(op.size(attr1).gt(0), op.eq(attr2, 'active'));

      expect(condition.operator).toBe('AND');
      expect(condition.children).toBeDefined();
      expect(condition.children).toHaveLength(2);
      expect(condition.children![0]!.expression).toBe('size(#tags) > :tags_size_0');
      expect(condition.children![1]!.expression).toBe('#status = :status_1');
    });

    it('should use IN with OR', () => {
      const op = createOpBuilder();
      const attr1 = { name: 'status' };
      const attr2 = { name: 'priority' };

      const condition = op.or(op.in(attr1, ['active', 'pending']), op.eq(attr2, 'high'));

      expect(condition.operator).toBe('OR');
      expect(condition.children).toBeDefined();
      expect(condition.children).toHaveLength(2);
      expect(condition.children![0]!.expression).toContain('IN');
      expect(condition.children![1]!.expression).toBe('#priority = :priority_2');
    });
  });
});
