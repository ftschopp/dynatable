import { type ReactNode, useState } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

const heroCode = `import { Table } from '@ftschopp/dynatable-core';

const schema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',
  indexes: { primary: { hash: 'PK', sort: 'SK' } },
  models: {
    User: {
      key: {
        PK: { type: String, value: 'USER#\${username}' },
        SK: { type: String, value: 'PROFILE' },
      },
      attributes: {
        username: { type: String, required: true },
        email: { type: String },
        age: { type: Number },
      },
    },
  },
} as const;

const table = new Table({ name: 'MyApp', client, schema });

// ✨ fully typed — inferred straight from your schema
const user = await table.entities.User
  .get({ username: 'alice' })
  .execute();

const adults = await table.entities.User
  .scan()
  .filter((a, op) => op.gt(a.age, 18))
  .execute();`;

const rawSdkCode = `import {
  DynamoDBClient,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const res = await client.send(
  new GetItemCommand({
    TableName: 'MyApp',
    Key: {
      PK: { S: \`USER#\${username}\` },
      SK: { S: 'PROFILE' },
    },
  }),
);

// unmarshall by hand — no types, easy to typo keys
const age = res.Item?.age?.N
  ? Number(res.Item.age.N)
  : undefined;`;

const dynatableCode = `import { table } from './db';

const user = await table.entities.User
  .get({ username })
  .execute();

// user: User | undefined
// keys are built for you, everything is typed
const age = user?.age;`;

const migrationsCode = `# scaffold migrations in your project
$ dynatable-migrate init

# create a versioned migration (semver bump)
$ dynatable-migrate create add_user_email --type minor
  ✓ migrations/0.2.0_add_user_email.ts

# preview changes — nothing is written
$ dynatable-migrate up --dry-run
  → 0.2.0  add_user_email   (dry run)

# apply: distributed lock + history in your table
$ dynatable-migrate up
  ✓ 0.2.0  add_user_email   applied

# roll back if you need to
$ dynatable-migrate down --steps 1`;

const INSTALL_CMD = 'yarn add @ftschopp/dynatable-core';

function InstallCommand(): ReactNode {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <button className={styles.install} onClick={copy} aria-label="Copy install command" type="button">
      <span className={styles.installPrompt}>$</span>
      <span className={styles.installText}>{INSTALL_CMD}</span>
      <span className={styles.installCopy}>{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  );
}

function CodeWindow({ file, children }: { file: string; children: ReactNode }): ReactNode {
  return (
    <div className={styles.codeWindow}>
      <div className={styles.codeWindowBar}>
        <span className={styles.dot} data-c="red" />
        <span className={styles.dot} data-c="yellow" />
        <span className={styles.dot} data-c="green" />
        <span className={styles.codeWindowFile}>{file}</span>
      </div>
      {children}
    </div>
  );
}

function Hero(): ReactNode {
  return (
    <header className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden />
      <div className={clsx('container', styles.heroInner)}>
        <div className={styles.heroCopy}>
          <Link className={styles.badge} to="/docs">
            <span className={styles.badgeDot} />
            v2 · built on AWS SDK v3
            <span className={styles.badgeArrow}>→</span>
          </Link>
          <Heading as="h1" className={styles.heroTitle}>
            Single-table design,
            <br />
            <span className="dt-gradient-text">made simple.</span>
          </Heading>
          <p className={styles.heroSubtitle}>
            Dynatable is a functional, fully typed TypeScript library for Amazon DynamoDB with
            first-class single-table design. Define your schema once — get end-to-end type inference,
            a fluent query builder, and safe schema migrations.
          </p>
          <div className={styles.heroActions}>
            <Link className="button button--primary button--lg" to="/docs">
              Get started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/guides/single-table-design">
              Single-table guide
            </Link>
          </div>
          <InstallCommand />
        </div>

        <div className={styles.heroVisual}>
          <CodeWindow file="schema.ts">
            <CodeBlock language="typescript">{heroCode}</CodeBlock>
          </CodeWindow>
        </div>
      </div>

      <TrustStrip />
    </header>
  );
}

const TRUST_ITEMS = [
  { value: '100%', label: 'Type inference' },
  { value: '2', label: 'Packages, zero fluff' },
  { value: 'AWS SDK v3', label: 'Under the hood' },
  { value: 'MIT', label: 'Open source' },
];

function TrustStrip(): ReactNode {
  return (
    <div className={clsx('container', styles.trust)}>
      {TRUST_ITEMS.map((item) => (
        <div key={item.label} className={styles.trustItem}>
          <span className={styles.trustValue}>{item.value}</span>
          <span className={styles.trustLabel}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function Comparison(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>Less code, more safety</span>
          <Heading as="h2" className={styles.sectionTitle}>
            Stop hand-writing DynamoDB
          </Heading>
          <p className={styles.sectionLead}>
            The raw AWS SDK makes you build keys, marshall attributes, and unmarshall responses by
            hand — with no type safety. Dynatable does it for you.
          </p>
        </div>
        <div className={styles.compareGrid}>
          <div className={styles.compareCol}>
            <div className={clsx(styles.compareTag, styles.compareTagBefore)}>Raw AWS SDK</div>
            <CodeWindow file="raw-sdk.ts">
              <CodeBlock language="typescript">{rawSdkCode}</CodeBlock>
            </CodeWindow>
          </div>
          <div className={styles.compareCol}>
            <div className={clsx(styles.compareTag, styles.compareTagAfter)}>With Dynatable</div>
            <CodeWindow file="dynatable.ts">
              <CodeBlock language="typescript">{dynatableCode}</CodeBlock>
            </CodeWindow>
          </div>
        </div>
      </div>
    </section>
  );
}

const MIGRATION_POINTS = [
  'Up / down migrations with semver versioning',
  'Dry-run mode to preview every change first',
  'Distributed locking prevents concurrent runs',
  'History lives in your table — no extra infra',
];

function Migrations(): ReactNode {
  return (
    <section className={styles.section}>
      <div className={clsx('container', styles.split)}>
        <div className={styles.splitCopy}>
          <span className={styles.eyebrow}>Schema migrations, included</span>
          <Heading as="h2" className={styles.sectionTitle}>
            Evolve your data with confidence
          </Heading>
          <p className={styles.sectionLead}>
            DynamoDB is schemaless, but your data still has a shape. The dedicated
            <code className={styles.inlineCode}>@ftschopp/dynatable-migrations</code> package brings
            versioned, reversible migrations and a full CLI — so shipping a data change feels as safe
            as a code change.
          </p>
          <ul className={styles.checkList}>
            {MIGRATION_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <div className={styles.heroActions}>
            <Link className="button button--primary button--lg" to="/docs/migrations">
              Explore migrations
            </Link>
            <Link
              className="button button--secondary button--lg"
              to="/docs/migrations/cli-reference"
            >
              CLI reference
            </Link>
          </div>
        </div>
        <div className={styles.splitVisual}>
          <CodeWindow file="terminal">
            <CodeBlock language="bash">{migrationsCode}</CodeBlock>
          </CodeWindow>
        </div>
      </div>
    </section>
  );
}

const PACKAGES = [
  {
    name: '@ftschopp/dynatable-core',
    tagline: 'The type-safe client',
    description:
      'Define your schema and get fully typed CRUD, a fluent query builder, transactions, batch operations, ULID/UUID generation and automatic timestamps.',
    install: 'yarn add @ftschopp/dynatable-core',
    to: '/docs/getting-started/installation',
  },
  {
    name: '@ftschopp/dynatable-migrations',
    tagline: 'Evolve your data safely',
    description:
      'Version your schema changes with up/down migrations, dry-run mode, distributed locking and a full CLI. Ship data changes with confidence.',
    install: 'yarn add @ftschopp/dynatable-migrations',
    to: '/docs/migrations',
  },
];

function Packages(): ReactNode {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className="container">
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>Two focused packages</span>
          <Heading as="h2" className={styles.sectionTitle}>
            Everything you need, nothing you don't
          </Heading>
        </div>
        <div className="row">
          {PACKAGES.map((pkg) => (
            <div key={pkg.name} className="col col--6 margin-bottom--lg">
              <Link to={pkg.to} className={styles.pkgCard}>
                <div className={styles.pkgTagline}>{pkg.tagline}</div>
                <Heading as="h3" className={styles.pkgName}>
                  {pkg.name}
                </Heading>
                <p className={styles.pkgDesc}>{pkg.description}</p>
                <code className={styles.pkgInstall}>{pkg.install}</code>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta(): ReactNode {
  return (
    <section className={styles.cta}>
      <div className={clsx('container', styles.ctaInner)}>
        <Heading as="h2" className={styles.ctaTitle}>
          Ready to build on DynamoDB?
        </Heading>
        <p className={styles.ctaLead}>
          Go from zero to a fully typed, production-ready data layer in minutes.
        </p>
        <div className={styles.heroActions}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/quick-start">
            Quick start
          </Link>
          <Link
            className="button button--secondary button--lg"
            href="https://github.com/ftschopp/dynatable"
          >
            Star on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Type-safe DynamoDB for TypeScript"
      description="A type-safe, functional TypeScript library for Amazon DynamoDB — end-to-end type inference, single-table design, a fluent query builder, and safe schema migrations."
    >
      <Hero />
      <main>
        <HomepageFeatures />
        <Comparison />
        <Migrations />
        <Packages />
        <FinalCta />
      </main>
    </Layout>
  );
}
