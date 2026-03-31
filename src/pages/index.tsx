import type {ReactNode} from 'react';
import {useState} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useColorMode} from '@docusaurus/theme-common';
import {Highlight, themes} from 'prism-react-renderer';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className={styles.heroBackground} />
      <div className={styles.heroGrid} />
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.heroLogoWrap}>
            <div className={styles.heroLogoGlow} />
            <img
              src="/img/raisin-logo-v1-nobg.webp"
              alt="RaisinDB"
              className={styles.heroLogo}
            />
          </div>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            <span>The Data Layer for Agentic Workflows</span>
          </div>
          <Heading as="h1" className={styles.heroTitle}>
            One database for content,
            <br />
            <span className={styles.heroTitleAccent}>versioned like Git.</span>
          </Heading>
          <p className={styles.heroSubtitle}>
            RaisinDB provides branching memory and state management your AI agents need to reason, iterate, and never forget context. Query with SQL, traverse graphs, search vectors — all through any PostgreSQL client.
          </p>
          <div className={styles.codeExample}>
            <div className={styles.codeHeader}>
              <span className={styles.codeDot} />
              <span className={styles.codeDot} />
              <span className={styles.codeDot} />
              <span className={styles.codeTitle}>Branching in action</span>
            </div>
            <CodeBlock language="sql" code={`-- Create an isolated branch for an agent task
CREATE BRANCH agent/research-42 FROM main;

-- Agent stores findings in its branch
INSERT INTO 'default' (path, node_type, properties)
VALUES ('/findings/report', 'research:Finding',
  '{"summary": "Key insight...", "confidence": 0.92}');

-- Merge results back when done
MERGE BRANCH agent/research-42 INTO main;`} />
          </div>
          <div className={styles.ctaRow}>
            <Link className={clsx('button button--secondary button--lg', styles.ctaPrimary)} to="/docs/tutorials/quickstart">
              Quickstart
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.ctaIcon}>
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <a className={clsx('button button--outline button--lg', styles.ctaSecondary)} href="https://github.com/maravilla-labs/raisindb" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>Rust + RocksDB</div>
              <div className={styles.statLabel}>High performance storage</div>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <div className={styles.statValue}>PostgreSQL Wire</div>
              <div className={styles.statLabel}>Connect with any SQL client</div>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <div className={styles.statValue}>Multi-Tenant</div>
              <div className={styles.statLabel}>Built-in data isolation</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function ReplaceYourStack() {
  return (
    <section className={styles.replaceSection}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.sectionTitle}>
            Replace Your Stack
          </Heading>
          <p className={styles.sectionSubtitle}>
            Stop stitching together services. RaisinDB unifies your data layer into a single, versioned database.
          </p>
        </div>

        <div className={styles.replaceGrid}>
          <div className={styles.replaceCol}>
            <div className={styles.replaceLabel}>Without RaisinDB</div>
            <div className={styles.replaceBoxes}>
              <div className={styles.replaceBox}>
                <span className={styles.replaceBoxIcon}>&#x1F418;</span>
                <span>PostgreSQL</span>
              </div>
              <div className={styles.replaceBox}>
                <span className={styles.replaceBoxIcon}>&#x1F50D;</span>
                <span>Elasticsearch</span>
              </div>
              <div className={styles.replaceBox}>
                <span className={styles.replaceBoxIcon}>&#x1F4BE;</span>
                <span>S3 / Blob Storage</span>
              </div>
              <div className={styles.replaceBox}>
                <span className={styles.replaceBoxIcon}>&#x1F500;</span>
                <span>Custom Versioning</span>
              </div>
              <div className={styles.replaceBox}>
                <span className={styles.replaceBoxIcon}>&#x1F9E0;</span>
                <span>Vector Database</span>
              </div>
              <div className={styles.replaceBox}>
                <span className={styles.replaceBoxIcon}>&#x1F512;</span>
                <span>Auth Service</span>
              </div>
            </div>
          </div>

          <div className={styles.replaceArrow}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M16 24H32M32 24L26 18M32 24L26 30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className={styles.replaceCol}>
            <div className={styles.replaceLabel}>With RaisinDB</div>
            <div className={styles.replaceUnified}>
              <div className={styles.replaceUnifiedIcon}>
                <img
                  src="/img/raisin-logo-v1-nobg.webp"
                  alt="RaisinDB"
                  className={styles.replaceUnifiedLogo}
                />
              </div>
              <div className={styles.replaceUnifiedTitle}>RaisinDB</div>
              <div className={styles.replaceUnifiedTags}>
                <span className={styles.replaceTag}>Documents</span>
                <span className={styles.replaceTag}>Search</span>
                <span className={styles.replaceTag}>Blobs</span>
                <span className={styles.replaceTag}>Versioning</span>
                <span className={styles.replaceTag}>Vectors</span>
                <span className={styles.replaceTag}>Auth & RBAC</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const queryTabs = [
  {
    id: 'document',
    label: 'Document',
    code: `SELECT * FROM 'default'
WHERE node_type = 'Article'
  AND properties->>'status'::String = 'published'
ORDER BY created_at DESC;`,
  },
  {
    id: 'graph',
    label: 'Graph',
    code: `SELECT * FROM GRAPH_TABLE(
  default
  MATCH (a:Article)-[:RELATED_TO]->(b)
  COLUMNS(a.path AS source, b.path AS target)
);`,
  },
  {
    id: 'vector',
    label: 'Vector',
    code: `SELECT path,
       DISTANCE(embedding, $query_vec) AS score
FROM 'default'
ORDER BY score
LIMIT 10;`,
  },
  {
    id: 'fulltext',
    label: 'Full-Text',
    code: `SELECT * FROM SEARCH(
  'default',
  'kubernetes AND deployment'
);`,
  },
  {
    id: 'timetravel',
    label: 'Time-Travel',
    code: `-- Query data as it existed at revision 42
SET __revision = 42;

SELECT * FROM 'default'
WHERE node_type = 'Article';`,
  },
  {
    id: 'transaction',
    label: 'Transactions',
    code: `-- Atomic operations across your data
BEGIN;

INSERT INTO 'content' (path, node_type, properties)
VALUES ('/blog/new-post', 'Article',
  '{"title": "Hello World", "status": "draft"}');

RELATE FROM path='/authors/alice'
  TO path='/blog/new-post' TYPE 'AUTHORED';

COMMIT WITH MESSAGE 'Add new post'
  ACTOR 'alice';`,
  },
];

function CodeBlock({code, language}: {code: string; language: string}) {
  const {colorMode} = useColorMode();
  const theme = colorMode === 'dark' ? themes.dracula : themes.github;

  return (
    <Highlight theme={theme} code={code} language={language}>
      {({className, style, tokens, getLineProps, getTokenProps}) => (
        <pre className={clsx(className, styles.tabCode)} style={{...style, background: 'transparent'}}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({line})}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({token})} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

function MultiModelTabs() {
  const [activeTab, setActiveTab] = useState('document');
  const active = queryTabs.find((t) => t.id === activeTab) || queryTabs[0];

  return (
    <section className={styles.tabsSection}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.sectionTitle}>
            One query language, every data model
          </Heading>
          <p className={styles.sectionSubtitle}>
            Documents, graphs, vectors, full-text, and time-travel — all through standard SQL via any PostgreSQL client.
          </p>
        </div>

        <div className={styles.tabsContainer}>
          <div className={styles.tabBar}>
            {queryTabs.map((tab) => (
              <button
                key={tab.id}
                className={clsx(styles.tab, activeTab === tab.id && styles.tabActive)}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className={styles.tabContent}>
            <CodeBlock code={active.code} language="sql" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section className={styles.featureSection}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.sectionTitle}>
            Everything you need in one database
          </Heading>
          <p className={styles.sectionSubtitle}>
            A multi-model database that combines document storage, graph queries, search, and version control in a single system.
          </p>
        </div>

        <div className={styles.bentoGrid}>
          <div className={clsx(styles.bentoCard, styles.bentoCardLarge)}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Git-like Versioning</Heading>
            <p className={styles.bentoDesc}>
              Branches, tags, and commits for your data. Draft and commit workflows, merge operations, revision history, and time-travel queries.
            </p>
            <div className={styles.bentoCode}>
              <code>CREATE BRANCH feature/new-content FROM main;</code>
            </div>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Schema-Driven Development</Heading>
            <p className={styles.bentoDesc}>
              Define NodeTypes in YAML with typed properties, validation rules, inheritance, and constraints. Deploy schemas as part of your codebase.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>PostgreSQL-Compatible SQL</Heading>
            <p className={styles.bentoDesc}>
              Connect with psql or any PostgreSQL client. Query with JSON operators, hierarchical functions, and standard SQL.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M5 9v3a4 4 0 0 0 4 4h2"/><path d="M19 9v3a4 4 0 0 1-4 4h-2"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Graph Queries</Heading>
            <p className={styles.bentoDesc}>
              Model relationships with bidirectional edges. Traverse graphs with SQL/PGQ and the NEIGHBORS() function.
            </p>
          </div>

          <div className={clsx(styles.bentoCard, styles.bentoCardWide)}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Full-Text Search</Heading>
            <p className={styles.bentoDesc}>
              Tantivy-powered search with multi-language stemming, fuzzy matching, wildcards, and relevance scoring. Indexes update with your data automatically.
            </p>
            <div className={styles.bentoCode}>
              <code>SELECT * FROM SEARCH('main', 'content:database AND type:article')</code>
            </div>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Vector Search</Heading>
            <p className={styles.bentoDesc}>
              Store embeddings and run KNN similarity queries. Build semantic search, RAG pipelines, and AI agent memory without external vector stores.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>RAP Packages</Heading>
            <p className={styles.bentoDesc}>
              Package schemas, content, and functions into Raisin Archive Packages. Distribute and install reusable content modules.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Serverless Functions</Heading>
            <p className={styles.bentoDesc}>
              Run JavaScript, Starlark, or SQL functions inside the database. Triggers, computed fields, and custom API endpoints.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>DCAD: Schema-Driven Apps</Heading>
            <p className={styles.bentoDesc}>
              Your schema defines your app. Archetypes map data to UX patterns — switch the archetype, change the entire interface without touching data.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Authentication & RBAC</Heading>
            <p className={styles.bentoDesc}>
              Pluggable auth strategies, workspace-scoped roles, row-level security. Content-centric permissions that replicate across clusters.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="m6.8 15-3.5 2"/><path d="m20.7 7-3.5 2"/><path d="M6.8 9 3.3 7"/><path d="m20.7 17-3.5-2"/><circle cx="12" cy="12" r="6"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>ACID Transactions</Heading>
            <p className={styles.bentoDesc}>
              Atomic commits across multiple operations. Begin, commit, or rollback — strong consistency across all data models in a single transaction.
            </p>
          </div>

          <div className={styles.bentoCard}>
            <div className={styles.bentoIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
            </div>
            <Heading as="h3" className={styles.bentoTitle}>Real-Time Events</Heading>
            <p className={styles.bentoDesc}>
              Subscribe to node changes via WebSocket or SSE. Filter by workspace, node type, or path. Automatic reconnection and deduplication built in.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  return (
    <section className={styles.useCaseSection}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.sectionTitle}>
            Built for Modern Applications
          </Heading>
        </div>

        <div className={styles.useCaseGrid}>
          <div className={styles.useCase}>
            <div className={styles.useCaseNumber}>01</div>
            <Heading as="h3" className={styles.useCaseTitle}>Content Management Systems</Heading>
            <p className={styles.useCaseDesc}>
              Manage articles, pages, and media with branching workflows and editorial review. Schema-driven content modeling with full revision history. Multi-tenant by design.
            </p>
          </div>

          <div className={styles.useCase}>
            <div className={styles.useCaseNumber}>02</div>
            <Heading as="h3" className={styles.useCaseTitle}>SaaS Platforms</Heading>
            <p className={styles.useCaseDesc}>
              Tenant isolation, workspace organization, and version-controlled data out of the box. REST API, WebSocket events, and PostgreSQL wire protocol for flexible integration.
            </p>
          </div>

          <div className={styles.useCase}>
            <div className={styles.useCaseNumber}>03</div>
            <Heading as="h3" className={styles.useCaseTitle}>AI Agent Memory & RAG</Heading>
            <p className={styles.useCaseDesc}>
              Give AI agents branching memory — each workflow gets its own branch to reason and iterate without corrupting shared state. Vector search for RAG, serverless functions for tool use, and full revision history so agents never lose context.
            </p>
          </div>

          <div className={styles.useCase}>
            <div className={styles.useCaseNumber}>04</div>
            <Heading as="h3" className={styles.useCaseTitle}>Schema-Driven Applications (DCAD)</Heading>
            <p className={styles.useCaseDesc}>
              Let your schema drive the UI. Archetypes define how data is presented — change the archetype, transform the interface. Build dynamic, data-centric apps without rewriting frontend code.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const connectTabs = [
  {
    id: 'nodejs',
    label: 'Node.js',
    language: 'javascript',
    code: `import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgresql://admin:admin@localhost:5432/myrepo'
});

// Standard PostgreSQL queries — just works
const { rows } = await pool.query(\`
  SELECT path, properties->>'title'::String AS title
  FROM 'content'
  WHERE node_type = 'news:Article'
    AND properties->>'status'::String = 'published'
  ORDER BY created_at DESC LIMIT 10
\`);

// Row-level security via user context
await client.query('SET app.user = $1', [accessToken]);
const results = await client.query(sql);
await client.query('RESET app.user');`,
  },
  {
    id: 'spring',
    label: 'Java / Spring',
    language: 'java',
    code: `@Repository
public class ArticleRepository {
  private final JdbcTemplate jdbc;

  // Standard Spring JdbcTemplate — no special driver needed
  public List<Article> findPublished(int limit) {
    return jdbc.query("""
      SELECT id, path, properties, created_at
      FROM content
      WHERE DESCENDANT_OF('/articles')
        AND node_type = 'news:Article'
        AND properties->>'status'::TEXT = 'published'
      ORDER BY properties->>'publishing_date' DESC
      LIMIT ?
      """, articleMapper, limit);
  }

  // Graph queries with REFERENCES
  public List<Article> findByTag(String tagPath) {
    return jdbc.query("""
      SELECT id, path, properties FROM content
      WHERE REFERENCES(?) AND node_type = 'news:Article'
      """, articleMapper, tagPath);
  }
}`,
  },
  {
    id: 'php',
    label: 'PHP / Laravel',
    language: 'php',
    code: `// Laravel — uses standard PostgreSQL connection
// config/database.php: 'driver' => 'pgsql'

$articles = RaisinQueryBuilder::query('content')
    ->descendantOf('/articles')
    ->whereNodeType('news:Article')
    ->wherePropertyContains(['status' => 'published'])
    ->orderByProperty('publishing_date', 'DESC')
    ->limit(12)
    ->get();

// Row-level security via middleware
DB::statement('SET app.user = ?', [$accessToken]);
$results = DB::select($sql, $params);
DB::statement('RESET app.user');`,
  },
  {
    id: 'python',
    label: 'Python',
    language: 'python',
    code: `import psycopg2

# Any PostgreSQL library works — no special SDK
conn = psycopg2.connect(
    host="localhost", port=5432,
    user="admin", dbname="myrepo"
)
cur = conn.cursor()
cur.execute("""
    SELECT path, properties->>'title' AS title
    FROM 'content'
    WHERE node_type = 'Article'
      AND properties->>'status'::String = 'published'
    ORDER BY created_at DESC
""")
articles = cur.fetchall()`,
  },
  {
    id: 'sdk',
    label: 'RaisinDB SDK',
    language: 'javascript',
    code: `import { RaisinDB } from '@raisindb/client';
const db = new RaisinDB('ws://localhost:8080');

// Template literal SQL with auto-parameterization
const articles = await db.sql\`
  SELECT * FROM 'content'
  WHERE node_type = \${'Article'}
\`;

// Real-time event subscriptions
db.events.subscribe({ nodeType: 'Article' },
  (event) => console.log('Changed:', event)
);

// ACID transactions with commit messages
const tx = await db.transaction();
await tx.begin({ message: 'Publish batch' });
await tx.nodes.update(id, { published: true });
await tx.commit();`,
  },
];

function ConnectYourWay() {
  const [activeConnect, setActiveConnect] = useState('nodejs');
  const active = connectTabs.find((t) => t.id === activeConnect) || connectTabs[0];

  return (
    <section className={styles.connectSection}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.sectionTitle}>
            Use your existing tools
          </Heading>
          <p className={styles.sectionSubtitle}>
            RaisinDB speaks PostgreSQL wire protocol. Connect with any standard library — no proprietary SDK required.
          </p>
        </div>

        <div className={styles.tabsContainer}>
          <div className={styles.tabBar}>
            {connectTabs.map((tab) => (
              <button
                key={tab.id}
                className={clsx(styles.tab, activeConnect === tab.id && styles.tabActive)}
                onClick={() => setActiveConnect(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className={styles.tabContent}>
            <CodeBlock code={active.code} language={active.language} />
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className={styles.ctaSection}>
      <div className="container">
        <div className={styles.ctaBox}>
          <Heading as="h2" className={styles.ctaBoxTitle}>
            Get Started with RaisinDB
          </Heading>
          <div className={styles.ctaInstall}>
            <code>npm install -g @raisindb/cli && raisindb server start</code>
          </div>
          <p className={styles.ctaBoxDesc}>
            One command to install, one to start. Define your first schema and start querying in minutes.
          </p>
          <div className={styles.ctaBoxButtons}>
            <Link className={clsx('button button--secondary button--lg')} to="/docs/tutorials/quickstart">
              Read the Quickstart
            </Link>
            <a className={clsx('button button--outline button--lg')} href="https://github.com/maravilla-labs/raisindb" target="_blank" rel="noreferrer">
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Multi-Model Database with Git-like Versioning`}
      description="RaisinDB is a multi-model database with SQL queries, graph relationships, vector search, and full-text indexing. Features git-like versioning with branches, commits, and schema definitions. Built with Rust.">
      <HomepageHeader />
      <main>
        <ReplaceYourStack />
        <MultiModelTabs />
        <FeatureGrid />
        <UseCases />
        <ConnectYourWay />
        <CTASection />
      </main>
    </Layout>
  );
}
