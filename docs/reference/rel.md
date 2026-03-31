---
sidebar_position: 5
---

# REL (Raisin Expression Language)

REL is a lightweight, safe expression language for evaluating conditions throughout RaisinDB. It is used in permission conditions, flow decision nodes, container rules, and the admin console condition builder.

## Where REL Is Used

| Context | Example |
|---------|---------|
| [Access control conditions](/docs/concepts/access-control#conditions) | `node.created_by == auth.local_user_id` |
| [Flow decision steps](/docs/guides/flows/defining-flows#decision-step) | `input.priority >= 5 \|\| input.urgent == true` |
| [Flow container rules](/docs/guides/flows/defining-flows#container-rules) | `input.region == 'eu'` |
| Admin console condition builder | Visual UI compiled to REL (via WASM) |

---

## Data Types

| Type | Examples | Notes |
|------|----------|-------|
| Null | `null` | Represents absence of a value |
| Boolean | `true`, `false` | |
| Integer | `42`, `-7`, `0` | 64-bit signed integer |
| Float | `3.14`, `-0.5` | 64-bit floating point |
| String | `'hello'`, `"world"` | Single or double quotes |
| Array | `[1, 2, 3]`, `['a', 'b']` | Heterogeneous elements |
| Object | `{key: 'value', count: 42}` | String keys, any values |

---

## Operators

### Precedence (lowest to highest)

| Precedence | Operator | Description |
|:----------:|----------|-------------|
| 1 | `\|\|` | Logical OR (short-circuit) |
| 2 | `&&` | Logical AND (short-circuit) |
| 3 | `==` `!=` `<` `>` `<=` `>=` `RELATES` | Comparison and graph traversal |
| 4 | `+` `-` | Addition, subtraction, string concatenation |
| 5 | `*` `/` `%` | Multiplication, division, modulo |
| 6 | `!` `-` (unary) | Logical NOT, numeric negation |
| 7 | `.` `[]` `.method()` | Property access, index access, method calls |

Use parentheses `()` to override precedence.

### Comparison

```
input.value == 42
input.status != 'archived'
input.count > 10
input.score < 100
input.priority >= 5
input.amount <= 1000
```

Equality (`==`, `!=`) works across all types. Integers and floats compare cross-type (`42 == 42.0` is `true`). Arrays and objects compare by deep equality.

Ordering (`<`, `>`, `<=`, `>=`) works on integers, floats, and strings. Strings compare lexicographically. Comparing incompatible types (e.g., string to integer) produces an error.

### Logical

```
input.active == true && input.verified == true
input.admin == true || input.moderator == true
!input.disabled
```

`&&` and `||` use **short-circuit evaluation**: the right operand is not evaluated if the left operand determines the result.

### Arithmetic

```
input.price * input.quantity
input.total / input.count
input.score % 10
input.base + input.bonus
input.balance - input.withdrawal
```

When mixing integers and floats, the result is promoted to float (`5 + 3.14` returns `8.14`). Division by zero produces an error.

The `+` operator also concatenates strings:

```
'hello' + ' ' + 'world'     // "hello world"
```

### Unary

```
!input.disabled              // logical NOT
-input.value                 // numeric negation
```

`!` converts the operand to a boolean via [truthiness](#truthiness) and negates it. `-` works on integers and floats only.

---

## Property Access

Access variables and nested properties with dot notation:

```
input.orderId
input.user.email
context.variables.result
auth.local_user_id
```

### Index Access

Access array elements by index and object properties by key:

```
input.items[0]
input.items[0].price
data["key"]
```

Negative indices produce an error. Out-of-bounds indices produce an error.

### Null Safety

Property access and method calls on `null` return `null` instead of an error, similar to JavaScript's optional chaining (`?.`):

```
input.user.name              // returns null if input.user is null
input.name.toLowerCase()     // returns null if input.name is null
```

This means you can safely chain property accesses without explicit null checks. Use `&&` short-circuit evaluation for conditional access:

```
input.meta && input.meta.published == true
```

---

## Methods

All methods use dot-call syntax: `value.method(args)`. Methods called on `null` return `null` (null-safe).

### Universal Methods

These work on strings, arrays, and objects.

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `length` | `value.length()` | Integer | Number of characters, elements, or keys |
| `isEmpty` | `value.isEmpty()` | Boolean | `true` if null, empty string, empty array, or empty object |
| `isNotEmpty` | `value.isNotEmpty()` | Boolean | Negation of `isEmpty()` |

```
input.name.length()          // 5 for "hello"
input.tags.length()          // 3 for ['a', 'b', 'c']
input.title.isEmpty()        // true for ""
input.items.isNotEmpty()     // true for [1, 2]
```

`length()` on `null` returns `0`.

### Polymorphic: contains

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `contains` | `string.contains(substring)` | Boolean | Check if string contains a substring |
| `contains` | `array.contains(element)` | Boolean | Check if array contains an element (deep equality) |

```
input.name.contains('test')         // substring check
input.tags.contains('urgent')       // array element check
auth.roles.contains('editor')       // role membership check
```

### String Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `startsWith` | `str.startsWith(prefix)` | Boolean | Check if string starts with prefix |
| `endsWith` | `str.endsWith(suffix)` | Boolean | Check if string ends with suffix |
| `toLowerCase` | `str.toLowerCase()` | String | Convert to lowercase |
| `toUpperCase` | `str.toUpperCase()` | String | Convert to uppercase |
| `trim` | `str.trim()` | String | Remove leading and trailing whitespace |
| `substring` | `str.substring(start)` | String | Extract from start index to end |
| `substring` | `str.substring(start, end)` | String | Extract from start to end index (exclusive) |

```
input.email.endsWith('@example.com')
input.code.startsWith('PRE-')
input.name.trim().toLowerCase()
input.text.substring(0, 10)
```

Indices in `substring` are clamped to valid ranges — out-of-bounds values are silently adjusted.

Methods can be chained:

```
input.name.trim().toLowerCase().contains('test')
```

### Array Methods

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `first` | `arr.first()` | Value | First element, or `null` if empty |
| `last` | `arr.last()` | Value | Last element, or `null` if empty |
| `indexOf` | `arr.indexOf(element)` | Integer | Index of element, or `-1` if not found |
| `join` | `arr.join()` | String | Concatenate elements with no separator |
| `join` | `arr.join(separator)` | String | Concatenate elements with separator |

```
input.items.first()
input.items.last()
input.ids.indexOf('abc')
input.names.join(', ')               // "alice, bob, carol"
[1, true, 'x'].join('-')             // "1-true-x"
```

`join` converts non-string elements to their string representation. Nested arrays and objects render as `[object]`.

### Path Methods

These methods operate on hierarchical path strings (e.g., `/content/blog/post1`).

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `parent` | `path.parent()` | String | Parent path (one level up) |
| `parent` | `path.parent(levels)` | String | Ancestor N levels up |
| `ancestor` | `path.ancestor(depth)` | String | Ancestor at absolute depth from root |
| `depth` | `path.depth()` | Integer | Number of path segments |
| `ancestorOf` | `path.ancestorOf(other)` | Boolean | Is this path an ancestor of other? |
| `descendantOf` | `path.descendantOf(other)` | Boolean | Is this path a descendant of other? |
| `childOf` | `path.childOf(other)` | Boolean | Is this a direct child of other? |

```
'/content/blog/post1'.parent()            // "/content/blog"
'/content/blog/post1'.parent(2)           // "/content"
'/content/blog/post1'.ancestor(1)         // "/content"
'/content/blog/post1'.ancestor(2)         // "/content/blog"
'/content/blog/post1'.depth()             // 3
'/content'.ancestorOf('/content/blog')    // true
'/content/blog'.descendantOf('/content')  // true
'/content/blog'.childOf('/content')       // true
'/content/blog/x'.childOf('/content')     // false (grandchild)
```

A path is **not** considered an ancestor or descendant of itself.

---

## Graph Relationships (RELATES)

The `RELATES` operator tests whether two nodes are connected through relationships in the graph. It is used in [permission conditions](/docs/concepts/access-control#graph-based-social) and evaluated asynchronously.

### Syntax

```
source RELATES target VIA relation_types [DEPTH min..max] [DIRECTION direction]
```

### Examples

```
// Single relation type
node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'

// Multiple relation types
node.created_by RELATES auth.local_user_id VIA ['FOLLOWS', 'FRIENDS_WITH']

// With depth (up to 3 hops)
node.created_by RELATES auth.local_user_id VIA 'MANAGES' DEPTH 1..3

// With direction
node.created_by RELATES auth.local_user_id VIA 'REPORTS_TO' DIRECTION OUTGOING
```

### Clauses

| Clause | Required | Default | Description |
|--------|----------|---------|-------------|
| `VIA` | Yes | — | Relation type(s) to traverse. Single string or array. |
| `DEPTH` | No | `1..1` | Min and max traversal hops (inclusive). `1..1` = direct connection only. |
| `DIRECTION` | No | `ANY` | `OUTGOING`, `INCOMING`, or `ANY`. |

### Use in Permissions

```yaml
# Friends can read my profile
- path: "users/**/profile"
  operations: ["read"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'"

# Friends-of-friends see limited fields (2 hops)
- path: "users/**/profile"
  operations: ["read"]
  fields: ["display_name", "avatar", "bio"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH' DEPTH 1..2"
```

---

## Truthiness

When a value is used in a boolean context (`&&`, `||`, `!`, or as a condition result), it is converted to a boolean:

| Type | Truthy | Falsy |
|------|--------|-------|
| Null | | `null` |
| Boolean | `true` | `false` |
| Integer | non-zero | `0` |
| Float | non-zero | `0.0` |
| String | non-empty | `""` |
| Array | non-empty | `[]` |
| Object | non-empty | `{}` |

---

## Type Coercion

REL performs limited automatic type coercion:

| Context | Rule |
|---------|------|
| Integer + Float arithmetic | Result promoted to Float |
| Integer == Float comparison | Integer is converted to Float for comparison |
| String + String | Concatenation (not arithmetic) |
| `!value` | Converted via [truthiness](#truthiness) |
| `&&` / `\|\|` operands | Converted via [truthiness](#truthiness), result is Boolean |

Incompatible operations produce errors rather than silent coercion. For example, `'hello' > 42` is an error, not a coerced comparison.

---

## Context Variables

REL expressions are evaluated against a context object. The available variables depend on where the expression is used.

### Permission Conditions

| Variable | Type | Description |
|----------|------|-------------|
| `node.id` | String | Node ID being accessed |
| `node.path` | String | Node path |
| `node.created_by` | String | Creator's user ID |
| `auth.local_user_id` | String | Current user's workspace-specific ID |
| `auth.user_id` | String | Current user's global identity ID |
| `auth.home` | String | User's home path (e.g., `/users/jane`) |
| `auth.email` | String | User's email |
| `auth.roles` | Array | Effective role IDs |
| `auth.groups` | Array | Group IDs |

### Flow Conditions

| Variable | Type | Description |
|----------|------|-------------|
| `input` | Object | Flow input data passed when starting the flow |
| `context.variables` | Object | Flow context variables set by previous steps |

---

## Security Behavior

In security contexts (permission evaluation), REL follows a **fail-closed** policy:

- Parse errors evaluate to `false` (access denied)
- Runtime evaluation errors evaluate to `false` (access denied)
- This ensures that malformed or unexpected conditions never grant access

---

## Grammar

```
expression     = or_expr
or_expr        = and_expr ( "||" and_expr )*
and_expr       = comparison   ( "&&" comparison )*
comparison     = additive ( ( "==" | "!=" | "<" | ">" | "<=" | ">=" ) additive
                           | "RELATES" additive "VIA" relation_types
                             [ "DEPTH" integer ".." integer ]
                             [ "DIRECTION" ( "OUTGOING" | "INCOMING" | "ANY" ) ] )?
additive       = multiplicative ( ( "+" | "-" ) multiplicative )*
multiplicative = unary ( ( "*" | "/" | "%" ) unary )*
unary          = "!" unary | "-" unary | postfix
postfix        = atom ( "." identifier [ "(" args ")" ] | "[" expression "]" )*
atom           = literal | identifier | "(" expression ")"
relation_types = STRING | "[" STRING ( "," STRING )* "]"
literal        = null | boolean | integer | float | string | array | object
args           = expression ( "," expression )*
array          = "[" [ expression ( "," expression )* ] "]"
object         = "{" [ identifier ":" expression ( "," identifier ":" expression )* ] "}"
```

---

## Examples

```
// Simple comparisons
input.amount > 1000
input.status == 'active'

// Combined conditions
(input.priority >= 5 || input.urgent == true) && input.enabled == true

// String matching
input.category.contains('premium')
input.email.endsWith('@company.com')

// Array operations
input.tags.contains('vip')
input.items.length() > 0

// Path checks
node.path.descendantOf('/content/blog')
node.path.startsWith(auth.home)
node.path.depth() <= 3

// Role and group checks (in permission conditions)
auth.roles.contains('editor')
auth.groups.contains('admins')

// Ownership check
node.id == auth.local_user_id
node.path.startsWith(auth.home)

// Graph relationship (in permission conditions)
node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'
node.created_by RELATES auth.local_user_id VIA 'MANAGES' DEPTH 1..3 DIRECTION OUTGOING

// Arithmetic
input.price * input.quantity > 10000
(input.score + input.bonus) / input.attempts >= 80

// Method chaining
input.name.trim().toLowerCase().contains('admin')
```
