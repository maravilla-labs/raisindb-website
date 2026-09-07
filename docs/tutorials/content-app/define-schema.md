---
sidebar_position: 1
---

# 1. Define the Schema

In this step you describe a small blog as a RaisinDB package: a NodeType for articles, an element type and an archetype for how an article is edited and rendered, a workspace that accepts articles, and one seed page. The package is a folder of YAML files that the CLI validates and, in the next step, installs.

## Create the package folder

```bash
raisindb package init content-app --workspace site --skip-install
cd content-app
```

The generator creates `package/manifest.yaml`, one workspace file, empty `nodetypes/`, `mixins/`, `archetypes/` and `elementtypes/` folders, and agent instruction files. The folders you fill in this tutorial:

```
package/
  manifest.yaml
  nodetypes/article.yaml
  elementtypes/quote.yaml
  archetypes/post.yaml
  workspaces/site.yaml
  content/site/pages/.node.yaml
  content/site/pages/home/.node.yaml
```

## The NodeType

`nodetypes/article.yaml` defines what an article stores. `type` is one of `String`, `Number`, `Boolean`, `Date`, `URL`, `Reference`, `Resource`, `Array`, `Object`, `Element`, `Composite`, `NodeType` or `Geometry`. Names follow `namespace:PascalCase`.

```yaml
name: blog:Article
description: A blog article
icon: article
version: 1
properties:
  - name: title
    type: String
    required: true
    index: [Fulltext]
  - name: slug
    type: String
    required: true
    unique: true
  - name: published_on
    type: Date
  - name: tags
    type: Array
    items:
      type: String
allowed_children: []
versionable: true
publishable: true
auditable: true
```

`required` and `unique` are enforced on every write. `index: [Fulltext]` makes the title searchable; add `Vector` for semantic search. `allowed_children: []` means an article never has child nodes.

## The element type

`elementtypes/quote.yaml` is a reusable block. Fields use `$type` names such as `TextField`, `RichTextField`, `NumberField`, `DateField`, `BooleanField`, `MediaField`, `ReferenceField`, `OptionsField` and `CompositeField`.

```yaml
name: blog:Quote
title: Quote
fields:
  - $type: RichTextField
    name: text
    title: Quote
    required: true
  - $type: TextField
    name: attribution
    title: Attribution
```

## The archetype

`archetypes/post.yaml` says how an article is presented: which fields the editor shows and which blocks may go into the body. `base_node_type` ties it to the NodeType.

```yaml
name: blog:Post
title: Blog Post
base_node_type: blog:Article
fields:
  - $type: TextField
    name: title
    title: Title
    required: true
  - $type: TextField
    name: slug
    title: Slug
    required: true
  - $type: DateField
    name: published_on
    title: Published on
  - $type: SectionField
    name: body
    title: Body
    allowed_element_types: [blog:Quote]
publishable: true
```

## The workspace

`workspaces/site.yaml` declares which NodeTypes the workspace accepts and creates a root folder on first install. Only `raisin:Folder` may sit at the root, so every article lives under a folder.

```yaml
name: site
description: Blog content
allowed_node_types:
  - raisin:Folder
  - blog:Article
allowed_root_node_types:
  - raisin:Folder
initial_structure:
  children:
    - name: pages
      node_type: raisin:Folder
      properties:
        title: Pages
```

## Seed content

Content is a directory tree under `content/{workspace}/`. Each directory is a node; its `.node.yaml` holds the type, optional archetype and properties, and its subdirectories are its children.

```yaml
# content/site/pages/.node.yaml
node_type: raisin:Folder
properties:
  title: Pages
```

```yaml
# content/site/pages/home/.node.yaml
node_type: blog:Article
archetype: blog:Post
properties:
  title: Hello
  slug: home
  body:
    - element_type: blog:Quote
      text: <p>Content is data.</p>
      attribution: RaisinDB
```

An element value is an object with an `element_type` and the element's field values.

## The manifest

`manifest.yaml` names the package and lists what it provides. The lists are how the server and the CLI know what to expect from the folders.

```yaml
name: content-app
version: 0.1.0
title: Content App
description: Tutorial package
license: MIT
provides:
  nodetypes:
    - blog:Article
  archetypes:
    - blog:Post
  elementtypes:
    - blog:Quote
  workspaces:
    - site
```

## Validate

```bash
raisindb package validate package
```

```
Validating package: /.../content-app/package
Validation: 7 file(s), 0 error(s), 0 warning(s)
```

Validation checks the YAML against the schema for each definition kind. A typo in a `$type` or a property `type` is reported here, before anything reaches a server.

## What comes next

The package is ready to build and install. [Install & Query](/docs/tutorials/content-app/install-and-query) deploys it with `raisindb package deploy` and queries the seed content with SQL.
