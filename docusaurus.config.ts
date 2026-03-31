import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'RaisinDB',
  tagline: 'Multi-Model Content Database with Git-like Versioning',
  favicon: 'img/favicon.ico',

  // Mermaid diagrams (```mermaid``` fenced blocks)
  themes: ['@docusaurus/theme-mermaid'],

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://raisindb.dev',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/',

  // Load Space Grotesk (headings) + DM Sans (body) from Google Fonts
  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap',
      type: 'text/css',
    },
  ],

  // GitHub pages deployment config.
  organizationName: 'maravilla-labs', // Usually your GitHub org/user name.
  projectName: 'raisindb', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang.
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Enable versioning
          lastVersion: 'current',
          versions: {
            current: {
              label: '0.1.0',
              badge: true,
            },
          },
          // Please change this to your repo.
          editUrl: 'https://github.com/maravilla-labs/raisindb-website/tree/main/',
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },

      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/raisin-logo-v1-nobg.webp',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'RaisinDB',
      logo: {
        alt: 'RaisinDB Logo',
        src: 'img/raisin-logo-v1-nobg.webp',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialsSidebar',
          position: 'left',
          label: 'Tutorials',
        },
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'referenceSidebar',
          position: 'left',
          label: 'Reference',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/maravilla-labs/raisindb',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            {
              label: 'Quick Start',
              to: '/docs/tutorials/quickstart',
            },
            {
              label: 'Concepts',
              to: '/docs/concepts/overview',
            },
          ],
        },
        {
          title: 'Documentation',
          items: [
            {
              label: 'Guides',
              to: '/docs/guides/installation',
            },
            {
              label: 'SQL Reference',
              to: '/docs/reference/sql/overview',
            },
            {
              label: 'HTTP API',
              to: '/docs/reference/http-api/overview',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/maravilla-labs/raisindb',
            },
            {
              label: 'Issues',
              href: 'https://github.com/maravilla-labs/raisindb/issues',
            },
          ],
        },
        {
          title: 'Legal',
          items: [
            {
              label: 'License (BSL 1.1)',
              href: 'https://github.com/maravilla-labs/raisindb/blob/main/LICENSE',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} <a href="https://www.maravillalabs.com" target="_blank" rel="noopener noreferrer">Maravilla Labs</a>. Licensed under Business Source License 1.1.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'sql', 'json', 'yaml', 'typescript', 'javascript', 'rust', 'java', 'php', 'python'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
