---
sidebar_position: 7
---

# Graph DML Statements

Statements for manipulating graph relationships, node positions, and content in RaisinDB.

## RELATE

Create a relationship between two nodes.

### Syntax

```sql
RELATE source_node TO target_node
    [ TYPE relationship_type ]
    [ WEIGHT weight_value ]
    [ IN BRANCH branch_name ]
    [ IN WORKSPACE workspace_name ]
```

### Examples

```sql
-- Create a basic relationship
RELATE '/content/page1' TO '/content/page2';

-- Create a typed relationship
RELATE '/users/alice' TO '/projects/alpha'
    TYPE 'member';

-- Create a weighted relationship
RELATE '/products/widget' TO '/categories/electronics'
    TYPE 'belongs_to'
    WEIGHT 1.0;

-- Create relationship in a specific branch
RELATE '/content/page1' TO '/content/page2'
    TYPE 'links_to'
    IN BRANCH feature_branch;

-- Create relationship in a specific workspace
RELATE '/docs/intro' TO '/docs/guide'
    TYPE 'see_also'
    IN WORKSPACE documentation;
```

---

## UNRELATE

Remove a relationship between two nodes.

### Syntax

```sql
UNRELATE source_node FROM target_node
    [ TYPE relationship_type ]
    [ IN BRANCH branch_name ]
    [ IN WORKSPACE workspace_name ]
```

### Examples

```sql
-- Remove all relationships between two nodes
UNRELATE '/content/page1' FROM '/content/page2';

-- Remove a specific relationship type
UNRELATE '/users/alice' FROM '/projects/alpha'
    TYPE 'member';

-- Remove relationship in a specific branch
UNRELATE '/content/page1' FROM '/content/page2'
    TYPE 'links_to'
    IN BRANCH feature_branch;
```

---

## MOVE

Move a node to a new position in the hierarchy.

### Syntax

```sql
MOVE source_path TO destination_path
```

### Examples

```sql
-- Move a node to a new parent
MOVE '/content/drafts/post1' TO '/content/published/post1';

-- Move a section
MOVE '/docs/old-section' TO '/archive/old-section';
```

---

## COPY

Copy a node, optionally with all its descendants.

### Syntax

```sql
COPY source_path TO destination_path
    [ RECURSIVE ]
```

### Examples

```sql
-- Copy a single node
COPY '/templates/page-template' TO '/content/new-page';

-- Copy a node and all descendants recursively
COPY '/content/blog/2024' TO '/archive/blog/2024'
    RECURSIVE;
```

---

## ORDER

Set the order of nodes within a parent.

### Syntax

```sql
ORDER node_path position
```

### Examples

```sql
-- Set node order position
ORDER '/content/menu/item1' 1;
ORDER '/content/menu/item2' 2;
ORDER '/content/menu/item3' 3;
```

---

## RESTORE

Restore a node from a previous revision.

### Syntax

```sql
RESTORE node_path [ AT REVISION revision_number ]
```

### Examples

```sql
-- Restore a node to its previous state
RESTORE '/content/page1';

-- Restore a node at a specific revision
RESTORE '/content/page1' AT REVISION 5;
```

---

## TRANSLATE

Create or update translations for node content.

### Syntax

```sql
TRANSLATE node_path TO language
    SET field = value [, ...]
```

### Examples

```sql
-- Translate content to Spanish
TRANSLATE '/content/homepage' TO 'es'
    SET title = 'Bienvenidos',
        description = 'Pagina principal';

-- Translate to French
TRANSLATE '/products/widget' TO 'fr'
    SET name = 'Widget',
        description = 'Un excellent produit';
```

---

## Examples

### Building a Navigation Structure

```sql
-- Create pages and establish relationships
INSERT INTO pages (title, status) VALUES ('Home', 'published');
INSERT INTO pages (title, status) VALUES ('About', 'published');
INSERT INTO pages (title, status) VALUES ('Contact', 'published');

-- Create navigation relationships
RELATE '/pages/home' TO '/pages/about' TYPE 'nav_link' WEIGHT 1.0;
RELATE '/pages/home' TO '/pages/contact' TYPE 'nav_link' WEIGHT 2.0;

-- Order the navigation items
ORDER '/pages/about' 1;
ORDER '/pages/contact' 2;
```

### Content Reorganization

```sql
-- Move old content to archive
MOVE '/content/2023' TO '/archive/2023';

-- Copy template for new year
COPY '/templates/year-template' TO '/content/2025' RECURSIVE;
```

### Multi-Language Content

```sql
-- Create base content
INSERT INTO products (name, description)
VALUES ('Premium Widget', 'High-quality widget for professionals');

-- Add translations
TRANSLATE '/products/premium-widget' TO 'es'
    SET name = 'Widget Premium',
        description = 'Widget de alta calidad para profesionales';

TRANSLATE '/products/premium-widget' TO 'de'
    SET name = 'Premium Widget',
        description = 'Hochwertiges Widget fuer Profis';
```

### Version-Controlled Relationships

```sql
-- Create relationships on a feature branch
USE BRANCH feature_new_links;

RELATE '/docs/quickstart' TO '/docs/advanced-guide'
    TYPE 'next_step';

RELATE '/docs/advanced-guide' TO '/docs/reference'
    TYPE 'next_step';

COMMIT MESSAGE 'Add documentation navigation flow';

-- Merge to main
MERGE BRANCH feature_new_links INTO main;
```

---

## Notes

- `RELATE` and `UNRELATE` manage graph edges between nodes
- `MOVE` changes the hierarchical position; the node's `__path` is updated
- `COPY` with `RECURSIVE` duplicates the entire subtree
- `ORDER` sets explicit ordering for sibling nodes
- `RESTORE` uses the version control system to revert node state
- `TRANSLATE` stores localized field values associated with a language code
- All graph DML operations are version-controlled and can be part of transactions
