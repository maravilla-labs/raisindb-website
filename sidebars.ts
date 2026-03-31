import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * Sidebars organized following the Diataxis framework:
 * - Tutorials - Learning-oriented (separate nav)
 * - Docs - Concepts (Understanding) + Guides (How-to)
 * - Reference - Information-oriented (separate nav)
 *
 * @see https://diataxis.fr
 */
const sidebars: SidebarsConfig = {
  // ==========================================================================
  // TUTORIALS - Learning-oriented
  // ==========================================================================
  tutorialsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Tutorials',
      collapsed: false,
      items: [
        'tutorials/quickstart',
      ],
    },
    {
      type: 'category',
      label: 'Build a Content App',
      items: [
        'tutorials/content-app/define-schema',
        'tutorials/content-app/install-and-query',
        'tutorials/content-app/graph-relationships',
        'tutorials/content-app/branching-workflow',
      ],
    },
    {
      type: 'category',
      label: 'AI Agent Memory',
      items: [
        'tutorials/ai-agent-memory/branching-isolation',
        'tutorials/ai-agent-memory/vector-search',
        'tutorials/ai-agent-memory/function-tool-use',
        'tutorials/ai-agent-memory/merge-results',
      ],
    },
    {
      type: 'category',
      label: 'DCAD: Schema-Driven Apps',
      items: [
        'tutorials/dcad/understanding-dcad',
        'tutorials/dcad/building-dynamic-ui',
        'tutorials/dcad/archetypes-in-practice',
      ],
    },
    'tutorials/data_driven_development/intro',
    'tutorials/kanaban-board',
  ],

  // ==========================================================================
  // DOCS - Concepts (Understanding) + Guides (How-to)
  // ==========================================================================
  docsSidebar: [
    // ------------------------------------------------------------------------
    // CONCEPTS
    // ------------------------------------------------------------------------
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      items: [
        'concepts/overview',
        {
          type: 'category',
          label: 'Data Model',
          items: [
            'concepts/data-model/nodes',
            'concepts/data-model/nodetypes',
            'concepts/data-model/archetypes',
            'concepts/data-model/elements',
            'concepts/data-model/paths-and-hierarchy',
          ],
        },
        {
          type: 'category',
          label: 'Versioning',
          items: [
            'concepts/versioning/git-like-workflows',
            'concepts/versioning/branches-and-tags',
            'concepts/versioning/revisions',
          ],
        },
        {
          type: 'category',
          label: 'Multi-Model Architecture',
          items: [
            'concepts/multi-model/document-model',
            'concepts/graph-model',
            'concepts/multi-model/vector-search',
            'concepts/multi-model/full-text-search',
          ],
        },
        'concepts/dcad',
        'concepts/workspaces',
        'concepts/access-control',
        'concepts/multi-tenancy',
        'concepts/replication',
      ],
    },

    // ------------------------------------------------------------------------
    // GUIDES
    // ------------------------------------------------------------------------
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/installation',
        {
          type: 'category',
          label: 'Connecting',
          items: [
            'guides/connecting/pgwire',
            'guides/connecting/http-api',
            'guides/connecting/javascript-client',
          ],
        },
        {
          type: 'category',
          label: 'Data Modeling',
          items: [
            'guides/data-modeling/creating-nodetypes',
            'guides/data-modeling/using-archetypes',
            'guides/data-modeling/defining-elements',
            'guides/data-modeling/data-modeling-strategy',
          ],
        },
        {
          type: 'category',
          label: 'Querying',
          items: [
            'guides/querying/sql-basics',
            'guides/querying/filtering-data',
            'guides/querying/graph-queries',
            'guides/querying/full-text-search',
            'guides/querying/time-travel-queries',
            'guides/querying/common-query-patterns',
          ],
        },
        {
          type: 'category',
          label: 'AI & Agents',
          items: [
            'guides/ai/ai-provider-configuration',
            'guides/ai/embeddings-and-vector-search',
            'guides/ai/agent-memory-with-branches',
            'guides/ai/rag-patterns',
            'guides/ai/function-based-tool-use',
          ],
        },
        {
          type: 'category',
          label: 'Authentication',
          items: [
            'guides/auth/authentication-setup',
            'guides/auth/roles-and-permissions',
            'guides/auth/row-level-security',
          ],
        },
        {
          type: 'category',
          label: 'Branching',
          items: [
            'guides/branching/working-with-branches',
            'guides/branching/merging-changes',
          ],
        },
        {
          type: 'category',
          label: 'Functions & Workflows',
          items: [
            'guides/functions/creating-functions',
            'guides/functions/triggers',
            'guides/functions/execution-logs',
            'guides/flows/defining-flows',
          ],
        },
        {
          type: 'category',
          label: 'Packages',
          items: [
            'guides/packages/creating-packages',
            'guides/packages/installing-packages',
            'guides/packages/builtin-packages',
            'guides/packages/sync-and-watch',
          ],
        },
        'guides/admin-console/using-admin-console',
      ],
    },
  ],

  // ==========================================================================
  // REFERENCE - Information-oriented
  // ==========================================================================
  referenceSidebar: [
    {
      type: 'category',
      label: 'SQL',
      collapsed: false,
      items: [
        'reference/sql/overview',
        {
          type: 'category',
          label: 'Statements',
          items: [
            'reference/sql/statements/select',
            'reference/sql/statements/insert',
            'reference/sql/statements/update',
            'reference/sql/statements/delete',
            'reference/sql/statements/ddl',
            'reference/sql/statements/branch',
            'reference/sql/statements/graph-dml',
          ],
        },
        {
          type: 'category',
          label: 'Functions',
          items: [
            'reference/sql/functions/string-functions',
            'reference/sql/functions/numeric-functions',
            'reference/sql/functions/json-functions',
            'reference/sql/functions/path-functions',
            'reference/sql/functions/datetime-functions',
            'reference/sql/functions/aggregate-functions',
            'reference/sql/functions/window-functions',
            'reference/sql/functions/geospatial-functions',
            'reference/sql/functions/fulltext-functions',
            'reference/sql/functions/vector-functions',
            'reference/sql/functions/system-functions',
            'reference/sql/functions/invoke-functions',
          ],
        },
        {
          type: 'category',
          label: 'Graph Queries',
          items: [
            'reference/sql/graph/pgq',
          ],
        },
        'reference/sql/data-types',
        'reference/sql/operators',
      ],
    },
    {
      type: 'category',
      label: 'HTTP API',
      items: [
        'reference/http-api/overview',
        'reference/http-api/authentication',
        'reference/http-api/nodes-api',
        'reference/http-api/nodetypes-api',
        'reference/http-api/branches-api',
        'reference/http-api/functions-api',
        'reference/http-api/query-api',
      ],
    },
    {
      type: 'category',
      label: 'JavaScript Client',
      items: [
        'reference/javascript-client/overview',
        'reference/javascript-client/connection',
        'reference/javascript-client/node-operations',
        'reference/javascript-client/events',
        'reference/javascript-client/chat',
        'reference/javascript-client/flows',
        'reference/javascript-client/functions',
        'reference/javascript-client/uploads',
      ],
    },
    {
      type: 'category',
      label: 'CLI',
      items: [
        'reference/cli/overview',
        'reference/cli/commands',
      ],
    },
    'reference/rel',
    'reference/configuration',
  ],
};

export default sidebars;
