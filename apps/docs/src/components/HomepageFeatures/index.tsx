import type { ReactNode } from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Type-Safe DynamoDB',
    icon: '🛡️',
    description: (
      <>
        Full TypeScript support with inferred types from your schema. Catch errors at compile time,
        not runtime. Every query, mutation, and scan is fully typed.
      </>
    ),
  },
  {
    title: 'Single Table Design',
    icon: '📊',
    description: (
      <>
        Built for DynamoDB best practices. Define multiple entities in one table with type-safe
        access patterns. Support for GSIs, composite keys, and complex relationships.
      </>
    ),
  },
  {
    title: 'Fluent Query Builder',
    icon: '🔍',
    description: (
      <>
        Intuitive, chainable API for queries and scans. Filter, project, paginate, and more with
        full type inference. No more raw DynamoDB expressions.
      </>
    ),
  },
  {
    title: 'Schema Migrations',
    icon: '🔄',
    description: (
      <>
        Evolve your data safely with versioned migrations. Up/down support, dry-run mode,
        distributed locking, and full CLI tooling included.
      </>
    ),
  },
  {
    title: 'Minimal Boilerplate',
    icon: '✨',
    description: (
      <>
        Define your schema once, get typed CRUD operations automatically. No decorators, no
        classes, just plain TypeScript objects.
      </>
    ),
  },
  {
    title: 'Production Ready',
    icon: '🚀',
    description: (
      <>
        Built on top of AWS SDK v3. Supports transactions, batch operations, conditional writes,
        and all DynamoDB features you need.
      </>
    ),
  },
];

function Feature({ title, icon, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
