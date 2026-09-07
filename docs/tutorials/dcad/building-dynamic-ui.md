---
sidebar_position: 2
---

# Building Dynamic UI

This tutorial turns the definitions from [Understanding DCAD](/docs/tutorials/dcad/understanding-dcad) into a small rendering engine: a script that fetches a node, picks a page renderer by `archetype`, and picks a block renderer by `element_type`. Then it switches the node's archetype and renders again without changing the script.

## 1. A second archetype on the same NodeType

Add a card element and a board archetype. The board uses a `CompositeField` of columns, each with a `SectionField` of cards.

```bash
API=http://localhost:8080/api/management/myrepo/main
H="Authorization: Bearer $TOKEN"; J='content-type: application/json'

curl -X POST $API/elementtypes -H "$H" -H "$J" -d '{
  "element_type": {
    "name": "dcad:KanbanCard", "title": "Card",
    "fields": [
      { "$type": "TextField", "name": "title", "required": true },
      { "$type": "OptionsField", "name": "status",
        "config": { "options": ["todo", "doing", "done"], "render_as": "Dropdown" } }
    ]
  }
}'
curl -X POST $API/elementtypes/dcad:KanbanCard/publish -H "$H"

curl -X POST $API/archetypes -H "$H" -H "$J" -d '{
  "archetype": {
    "name": "dcad:KanbanBoard", "title": "Kanban Board", "base_node_type": "dcad:Page",
    "fields": [
      { "$type": "TextField", "name": "title", "required": true },
      { "$type": "TextField", "name": "slug", "required": true },
      { "$type": "CompositeField", "name": "columns", "title": "Columns",
        "fields": [
          { "$type": "TextField", "name": "title", "required": true },
          { "$type": "SectionField", "name": "cards", "allowed_element_types": ["dcad:KanbanCard"] }
        ] }
    ],
    "publishable": true
  }
}'
curl -X POST $API/archetypes/dcad:KanbanBoard/publish -H "$H"
```

## 2. The rendering engine

Save this as `render.mjs`. It uses only `fetch`, so it runs with Node 18 or newer.

```javascript
const base = 'http://localhost:8080';
const repo = 'myrepo', ws = 'site';

const { token } = await (await fetch(`${base}/api/raisindb/sys/default/auth`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: process.env.RAISIN_PASSWORD }),
})).json();
const headers = { authorization: `Bearer ${token}` };

// Block renderers, keyed by element_type
const elements = {
  'dcad:Hero':       (e) => `<section class="hero"><h1>${e.headline}</h1><p>${e.subheadline ?? ''}</p></section>`,
  'dcad:TextBlock':  (e) => `<article>${e.body}</article>`,
  'dcad:KanbanCard': (e) => `<li class="card ${e.status ?? ''}">${e.title}</li>`,
};
const element = (e) =>
  (elements[e.element_type] ?? ((x) => `<!-- no renderer for ${x.element_type} -->`))(e);

// Page renderers, keyed by archetype
const archetypes = {
  'dcad:LandingPage': (p) => `<main>${(p.content ?? []).map(element).join('')}</main>`,
  'dcad:KanbanBoard': (p) => `<main class="board">${(p.columns ?? []).map((c) =>
      `<section><h2>${c.title}</h2><ul>${(c.cards ?? []).map(element).join('')}</ul></section>`).join('')}</main>`,
};

async function render(path) {
  const res = await fetch(`${base}/api/repository/${repo}/main/head/${ws}${path}`, { headers });
  if (!res.ok) return '<h1>404</h1>';
  const node = await res.json();
  const page = archetypes[node.archetype] ?? (() => `<pre>${JSON.stringify(node.properties)}</pre>`);
  return `<title>${node.properties.title}</title>` + page(node.properties);
}

console.log(await render('/home'));
```

Run it against the landing page created in the previous tutorial:

```bash
RAISIN_PASSWORD=... node render.mjs
```

```html
<title>Home</title><main><section class="hero"><h1>Welcome</h1><p>Build on data</p></section><article><p>Hello</p></article></main>
```

The script never mentions `/home`. Any node in the workspace renders the same way, and a node whose archetype has no renderer falls back to a dump of its properties instead of failing.

## 3. Switch the archetype

The archetype is a column on the node, so one SQL statement changes what `/home` is. Replace the landing page content with board content at the same time:

```bash
curl -X POST http://localhost:8080/api/sql/myrepo -H "$H" -H "$J" -d @- <<'EOF'
{"sql": "UPDATE 'site' SET archetype = 'dcad:KanbanBoard', properties = '{\"title\":\"Home\",\"slug\":\"home\",\"columns\":[{\"title\":\"Todo\",\"cards\":[{\"element_type\":\"dcad:KanbanCard\",\"title\":\"Write docs\",\"status\":\"doing\"}]}]}'::jsonb WHERE path = '/home'"}
EOF
```

```json
{"columns":["affected_rows"],"rows":[{"affected_rows":1}],"row_count":1}
```

Run the script again, unchanged:

```html
<title>Home</title><main class="board"><section><h2>Todo</h2><ul><li class="card doing">Write docs</li></ul></section></main>
```

The same path now renders as a board because the registry looked up a different archetype.

:::note
The node REST `PUT` endpoint updates `properties` and `translations` only; it does not change `archetype` or `node_type`. Use SQL `UPDATE ... SET archetype = ...` as above, or recreate the node, to change a node's archetype.
:::

## 4. Where to go from here

- **Editors, not just renderers.** `GET $API/archetypes/dcad:KanbanBoard/resolved` returns `resolved_fields` and `resolved_layout`. An editor can build its form from that response the same way the script builds pages from `archetype`.
- **Components instead of strings.** In React, Svelte or Vue, make the registry map names to components; the lookup logic is identical.
- **New blocks without deployments.** Adding an element type to a section's `allowed_element_types` lets editors use it immediately. The renderer's fallback comment shows you which registry entry is still missing.

Next: [Archetypes in Practice](/docs/tutorials/dcad/archetypes-in-practice) covers archetype inheritance and layouts.
