import type { ReactNode, SVGProps } from 'react';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type Icon = (props: SVGProps<SVGSVGElement>) => ReactNode;

type FeatureItem = {
  title: string;
  icon: Icon;
  description: ReactNode;
};

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ShieldIcon: Icon = (p) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path {...stroke} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path {...stroke} d="M9 12l2 2 4-4" />
  </svg>
);

const TableIcon: Icon = (p) => (
  <svg viewBox="0 0 24 24" {...p}>
    <rect {...stroke} x="3" y="4" width="18" height="16" rx="2" />
    <path {...stroke} d="M3 9h18M9 9v11M3 14.5h18" />
  </svg>
);

const SearchIcon: Icon = (p) => (
  <svg viewBox="0 0 24 24" {...p}>
    <circle {...stroke} cx="11" cy="11" r="6" />
    <path {...stroke} d="M20 20l-4-4" />
  </svg>
);

const MigrateIcon: Icon = (p) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path {...stroke} d="M4 8h12l-2.5-2.5M4 8l2.5 2.5" />
    <path {...stroke} d="M20 16H8l2.5-2.5M20 16l-2.5 2.5" />
  </svg>
);

const SparkleIcon: Icon = (p) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path {...stroke} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    <path {...stroke} d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
  </svg>
);

const RocketIcon: Icon = (p) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path {...stroke} d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
    <path {...stroke} d="M9 15l-3-3c3-6 7-9 12-9 0 5-3 9-9 12z" />
    <circle {...stroke} cx="14.5" cy="9.5" r="1.6" />
  </svg>
);

const FeatureList: FeatureItem[] = [
  {
    title: 'End-to-end type safety',
    icon: ShieldIcon,
    description:
      'Types are inferred straight from your schema. Every get, query, scan and mutation is fully typed — catch mistakes at compile time, not in production.',
  },
  {
    title: 'Single-table design, built in',
    icon: TableIcon,
    description:
      'Model many entities in one table the DynamoDB way. Composite keys, GSIs, and complex relationships — without hand-writing key strings.',
  },
  {
    title: 'Fluent query builder',
    icon: SearchIcon,
    description:
      'A chainable, immutable API for queries and scans. Filter, project, and paginate with full type inference — no more raw DynamoDB expressions.',
  },
  {
    title: 'Safe schema migrations',
    icon: MigrateIcon,
    description:
      'Evolve your data with versioned up/down migrations, dry-run mode, distributed locking and a full CLI — shipped as a dedicated package.',
  },
  {
    title: 'Minimal boilerplate',
    icon: SparkleIcon,
    description:
      'Define your schema once and get typed CRUD automatically. No decorators, no classes — just plain, immutable TypeScript objects.',
  },
  {
    title: 'Production ready',
    icon: RocketIcon,
    description:
      'Built on AWS SDK v3 with transactions, batch operations, conditional writes, ULID/UUID generation and automatic timestamps out of the box.',
  },
];

function Feature({ title, icon: IconCmp, description }: FeatureItem) {
  return (
    <div className="col col--4">
      <div className={styles.feature}>
        <div className={styles.featureIcon}>
          <IconCmp width={26} height={26} />
        </div>
        <Heading as="h3" className={styles.featureTitle}>
          {title}
        </Heading>
        <p className={styles.featureDesc}>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props) => (
            <Feature key={props.title} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
