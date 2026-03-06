import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

const exampleCode = `import { Table } from '@ftschopp/dynatable-core';

const table = new Table({
  name: 'MyApp',
  client: dynamoDBClient,
  schema: {
    models: {
      User: {
        primaryKey: { PK: 'USER#\${username}', SK: 'PROFILE' },
        attributes: { username: 'string', email: 'string', age: 'number' },
      },
    },
  },
});

// Fully typed operations
const user = await table.entities.User.get({ username: 'alice' }).execute();
const users = await table.entities.User.scan()
  .filter((a, op) => op.gt(a.age, 18))
  .execute();`;

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs">
            Get Started
          </Link>
          <Link
            className="button button--outline button--lg"
            to="/docs/migrations"
            style={{ marginLeft: '1rem', color: 'white', borderColor: 'white' }}
          >
            Migrations
          </Link>
        </div>
      </div>
    </header>
  );
}

function CodeExample(): ReactNode {
  return (
    <section className={styles.codeExample}>
      <div className="container">
        <div className="row">
          <div className="col col--10 col--offset-1">
            <Heading as="h2" className="text--center" style={{ marginBottom: '2rem' }}>
              Simple, Intuitive API
            </Heading>
            <CodeBlock language="typescript">{exampleCode}</CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function Packages(): ReactNode {
  return (
    <section style={{ padding: '4rem 0', backgroundColor: 'var(--ifm-color-emphasis-100)' }}>
      <div className="container">
        <Heading as="h2" className="text--center" style={{ marginBottom: '2rem' }}>
          Packages
        </Heading>
        <div className="row">
          <div className="col col--6">
            <div
              className="card"
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div className="card__header">
                <Heading as="h3">@ftschopp/dynatable-core</Heading>
              </div>
              <div className="card__body" style={{ flex: 1 }}>
                <p>
                  Type-safe DynamoDB client with fluent query builder. Define your schema, get fully
                  typed CRUD operations.
                </p>
              </div>
              <div className="card__footer">
                <code>npm install @ftschopp/dynatable-core</code>
              </div>
            </div>
          </div>
          <div className="col col--6">
            <div
              className="card"
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div className="card__header">
                <Heading as="h3">@ftschopp/dynatable-migrations</Heading>
              </div>
              <div className="card__body" style={{ flex: 1 }}>
                <p>
                  Schema migrations for DynamoDB. Version your data changes with up/down migrations,
                  CLI tooling, and dry-run mode.
                </p>
              </div>
              <div className="card__footer">
                <code>npm install @ftschopp/dynatable-migrations</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <CodeExample />
        <Packages />
      </main>
    </Layout>
  );
}
