import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const SITE_URL = 'https://ftschopp.github.io/dynatable/';
const SITE_DESCRIPTION =
  'A type-safe, functional TypeScript library for Amazon DynamoDB — end-to-end type inference, single-table design, a fluent query builder, and safe schema migrations.';

// Schema.org structured data for rich search results.
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Dynatable',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Node.js, Cross-platform',
  programmingLanguage: 'TypeScript',
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  softwareVersion: '2',
  license: 'https://opensource.org/licenses/MIT',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: 'ftschopp', url: 'https://github.com/ftschopp' },
  sameAs: [
    'https://github.com/ftschopp/dynatable',
    'https://www.npmjs.com/package/@ftschopp/dynatable-core',
  ],
};

const config: Config = {
  title: 'Dynatable',
  tagline: 'Type-safe DynamoDB for TypeScript — with first-class single-table design',
  favicon: 'img/favicon.svg',

  // Set the production url of your site here
  url: 'https://ftschopp.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/dynatable/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'ftschopp', // Usually your GitHub org/user name.
  projectName: 'dynatable', // Usually your repo name.
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'warn', // Changed from 'throw' to allow build while docs are being completed

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  // Brand typography: Inter for UI, JetBrains Mono for code.
  headTags: [
    {
      tagName: 'link',
      attributes: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    },
    {
      tagName: 'link',
      attributes: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
    },
    // Structured data for SEO / rich results.
    {
      tagName: 'script',
      attributes: { type: 'application/ld+json' },
      innerHTML: JSON.stringify(structuredData),
    },
  ],
  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/ftschopp/dynatable/tree/main/apps/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/dynatable-og.png',
    metadata: [
      {
        name: 'keywords',
        content:
          'dynamodb, typescript, type-safe, single-table design, aws, aws sdk v3, orm, odm, query builder, schema migrations, serverless, ddb',
      },
      { name: 'description', content: SITE_DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Dynatable' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:image:alt', content: 'Dynatable — type-safe DynamoDB for TypeScript' },
    ],
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Dynatable',
      logo: {
        alt: 'Dynatable Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/getting-started/quick-start',
          label: 'Quick Start',
          position: 'left',
        },
        {
          to: '/docs/migrations',
          label: 'Migrations',
          position: 'left',
        },
        {
          href: 'https://www.npmjs.com/package/@ftschopp/dynatable-core',
          label: 'npm',
          position: 'right',
          className: 'navbar-npm-link',
        },
        {
          href: 'https://github.com/ftschopp/dynatable',
          label: 'Star',
          position: 'right',
          className: 'navbar-star',
          'aria-label': 'Star Dynatable on GitHub',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Introduction',
              to: '/docs',
            },
            {
              label: 'Getting Started',
              to: '/docs/getting-started/installation',
            },
            {
              label: 'Guides',
              to: '/docs/guides/single-table-design',
            },
            {
              label: 'Migrations',
              to: '/docs/migrations',
            },
            {
              label: 'Examples',
              to: '/docs/examples/blog-system',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/ftschopp/dynatable',
            },
            {
              label: 'Issues',
              href: 'https://github.com/ftschopp/dynatable/issues',
            },
            {
              label: 'Discussions',
              href: 'https://github.com/ftschopp/dynatable/discussions',
            },
          ],
        },
        {
          title: 'Learn',
          items: [
            {
              label: 'Single Table Design',
              to: '/docs/guides/single-table-design',
            },
            {
              label: 'Data Modeling',
              to: '/docs/guides/data-modeling',
            },
            {
              label: 'Queries',
              to: '/docs/guides/queries',
            },
            {
              label: 'Mutations',
              to: '/docs/guides/mutations',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Dynatable · MIT Licensed`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.nightOwl,
      defaultLanguage: 'typescript',
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
