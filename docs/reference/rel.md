---
sidebar_position: 5
---

# REL (Raisin Expression Language)

REL is a small, side-effect-free expression language. RaisinDB uses it wherever a configuration needs a condition: permission rules, workflow decisions and loops, and template expressions in workflow data mappings. An expression reads values from a context object, combines them with operators and method calls, and produces a value. In condition positions that value is converted to a boolean using the [truthiness](#truthiness) rules.

```
node.created_by == auth.user_id || auth.roles.contains('editor')
```

## Where REL is used

| Context | Field | Example |
|---------|-------|---------|
| [Permission conditions](/docs/concepts/access-control#conditions) | `condition` on a permission | `node.created_by == auth.user_id` |
| [Workflow decision steps](/docs/guides/workflows/data-and-templates#rel-conditions) | `condition` (`yes_branch` / `no_branch`) | `input.priority >= 5 \|\| input.urgent == true` |
| [Workflow `or` containers](/docs/guides/workflows/flow-definition#or--rel-routed-exactly-one-child) | rule `condition` | `input.region == 'eu'` |
| Workflow loop steps | `condition` (while loops) and `until` | `visits.draft < 3` |
| Workflow templates | `${...}` and `{{...}}` in data mappings | `"${steps.classify.label}"` |
| Human task groups | `response_condition` | `response.approved == true` |
| Admin console condition builder | visual builder compiled to REL through a WASM build of the same parser | |

Which variables are available depends on the context. See [Context variables](#context-variables).

## Values

| Type | Literal examples | Notes |
|------|------------------|-------|
| Null | `null` | Absence of a value |
| Boolean | `true`, `false` | |
| Integer | `42`, `-7`, `0` | 64-bit signed |
| Float | `3.14`, `-0.5`, `1e3`, `2.5E-3` | 64-bit; any literal with `.` or an exponent is a float |
| String | `'hello'`, `"world"` | Single or double quotes. Escapes: `\n` `\r` `\t` `\\` `\'` `\"` |
| Array | `[1, 2, 3]`, `['a', 'b']` | Elements may be of different types |
| Object | `{key: 'value', count: 42}`, `{'a-b': 1}` | Keys are identifiers or quoted strings |

Array and object literals may only contain other literals. `[input.price]` is a parse error; build the value in the context instead and reference it.

Context values arrive as JSON. JSON numbers without a fractional part become integers, everything else maps one to one.

## Operators

Precedence from lowest to highest. Use parentheses to group.

| Level | Operators | Meaning |
|:-----:|-----------|---------|
| 1 | `\|\|` | Logical OR, short-circuit |
| 2 | `&&` | Logical AND, short-circuit |
| 3 | `==` `!=` `<` `>` `<=` `>=` `RELATES` | Comparison and graph relationship |
| 4 | `+` `-` | Addition, subtraction, string concatenation |
| 5 | `*` `/` `%` | Multiplication, division, modulo |
| 6 | `!` `-` | Logical NOT, numeric negation (prefix) |
| 7 | `.name` `[index]` `.method(...)` | Property access, index access, method call |

Comparisons do not chain: `1 < 2 < 3` is a parse error. The word forms `and`, `or` and `not` do not exist; `input.a and input.b` is a parse error.

### Comparison

```
input.status != 'archived'
input.count > 10
input.priority >= 5
```

`==` and `!=` work on every type. Integers and floats compare across types (`42 == 42.0` is `true`). Arrays compare element by element and objects key by key.

`<`, `>`, `<=`, `>=` work on integers, floats and strings. Strings compare lexicographically by byte. Comparing a string with a number is an evaluation error (`Cannot compare string with integer`).

### Logical

```
input.active == true && input.verified == true
auth.roles.contains('admin') || auth.roles.contains('moderator')
!input.disabled
```

`&&` and `||` evaluate their right operand only when needed and always return a boolean. `input.price && input.qty` returns `true` when both are truthy, not the second operand.

### Arithmetic

```
input.price * input.quantity
input.total / input.count
input.score % 10
'hello' + ' ' + 'world'
```

Integer with integer stays integer, so `7 / 2` is `3`. Mixing an integer and a float promotes to float (`5 + 3.14` is `8.14`). Division or modulo by zero is an error. `+` concatenates two strings; a string plus a number is an error.

### Unary

`!x` negates the [truthiness](#truthiness) of any value. `-x` negates an integer or float and errors on anything else.

## Property and index access

```
input.user.email
auth.roles[0]
input.items[0].price
steps.classify.output['label']
```

Property access with `.` is null-safe: reading a missing key, or any key on `null` or on a non-object value, returns `null`. A chain like `input.user.name` therefore returns `null` when `input.user` is absent, and a method on the result also returns `null`.

Index access with `[...]` is stricter:

- On an array the index must be an integer (a float with no fractional part is accepted). A negative or out-of-range index is an error.
- On an object the index must be a string. A missing key is an error (`Property 'zz' not found on object`), unlike `.zz`.
- On `null` the result is `null`.
- On any other value it is an error.

A top-level variable that is not in the context is an error (`Undefined variable: nope`), not `null`.

Identifiers start with a letter or `_` and contain letters, digits and `_`. The words `true`, `false`, `null`, `contains`, `startsWith`, `endsWith`, `RELATES`, `VIA`, `DEPTH`, `DIRECTION`, `OUTGOING`, `INCOMING` and `ANY` cannot be used as top-level variable names. They are fine after a dot (`input.contains`).

## Methods

Methods use dot-call syntax and can be chained. Calling any method on `null` returns `null`. An unknown method name or a wrong number of arguments is an error.

### Universal

| Method | Works on | Returns |
|--------|----------|---------|
| `length()` | string, array, object | Byte length of a string, number of elements, or number of keys. `0` for null. |
| `isEmpty()` | any | `true` for null, `''`, `[]`, `{}`; `false` for everything else, including `0` |
| `isNotEmpty()` | any | The opposite of `isEmpty()` |
| `contains(x)` | string, array | Substring test for a string (`x` must be a string); deep-equality element test for an array |

```
input.tags.contains('urgent')
auth.roles.contains('editor')
input.name.contains('test')
input.items.length() > 0
```

### String

| Method | Returns |
|--------|---------|
| `startsWith(prefix)` | Boolean |
| `endsWith(suffix)` | Boolean |
| `toLowerCase()` | String |
| `toUpperCase()` | String |
| `trim()` | String without leading and trailing whitespace |
| `substring(start)` | From byte index `start` to the end |
| `substring(start, end)` | From `start` to `end` (exclusive) |

`substring` clamps indices to the string length; a negative index yields an empty string. Indices are byte offsets, so slicing inside a multi-byte character is not safe.

```
input.email.endsWith('@example.com')
input.name.trim().toLowerCase().contains('admin')
```

### Array

| Method | Returns |
|--------|---------|
| `first()` | First element, or `null` when empty |
| `last()` | Last element, or `null` when empty |
| `indexOf(x)` | Index of the first element deep-equal to `x`, or `-1` |
| `join()` | Elements concatenated with no separator |
| `join(sep)` | Elements concatenated with `sep` |

`join` renders numbers and booleans as text, `null` as `null`, and nested arrays or objects as `[object]`. `[1, true, 'x', null].join('-')` is `"1-true-x-null"`.

### Path

These operate on a string that holds a slash-separated path such as `/content/blog/post1`.

| Method | Returns |
|--------|---------|
| `parent()` | Path one level up. `'/content'.parent()` is `'/'`; `'/'.parent()` is `''` |
| `parent(n)` | Path `n` levels up, or `''` when that goes past the root |
| `ancestor(d)` | The prefix that is `d` segments deep from the root. `ancestor(0)` is `''`; a depth beyond the path is `''` |
| `depth()` | Number of non-empty segments |
| `ancestorOf(other)` | `true` if `other` lies strictly below this path |
| `descendantOf(other)` | `true` if this path lies strictly below `other` |
| `childOf(other)` | `true` if this path is a direct child of `other` |

```
'/content/blog/post1'.parent()            // '/content/blog'
'/content/blog/post1'.parent(2)           // '/content'
'/content/blog/post1'.ancestor(1)         // '/content'
'/content/blog/post1'.depth()             // 3
'/content'.ancestorOf('/content/blog')    // true
'/content/blog'.descendantOf('/content')  // true
'/content/blog/x'.childOf('/content')     // false
node.path.descendantOf(auth.home)
```

A path is not its own ancestor or descendant.

## Graph relationships (RELATES)

`RELATES` asks whether two nodes are connected by relations of the given types. It is available in permission conditions, where the server supplies a graph resolver. Both sides must evaluate to strings (node ids).

```
source RELATES target VIA types [DEPTH min..max] [DIRECTION OUTGOING|INCOMING|ANY]
```

| Clause | Required | Default | Meaning |
|--------|----------|---------|---------|
| `VIA` | yes | | One relation type as a string, or several in an array |
| `DEPTH` | no | `1..1` | Inclusive range of hops. Both bounds are required (`DEPTH 1` is a parse error) |
| `DIRECTION` | no | `ANY` | Which way the relation may point, from the source |

```
node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'
node.created_by RELATES auth.local_user_id VIA ['FOLLOWS', 'FRIENDS_WITH']
node.created_by RELATES auth.local_user_id VIA 'MANAGES' DEPTH 1..3 DIRECTION OUTGOING
input.value > 10 && node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'
```

The target after `RELATES` is a single operand (a variable, property chain, literal or parenthesised expression), not an arithmetic expression.

In a permission rule:

```yaml
- path: "users/**/profile"
  operations: ["read"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'"

- path: "users/**/profile"
  operations: ["read"]
  fields: ["display_name", "avatar", "bio"]
  condition: "node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH' DEPTH 1..2"
```

`RELATES` needs the asynchronous evaluator with a relation resolver. Workflow conditions and templates use the synchronous evaluator, so a `RELATES` expression there fails with an evaluation error. A permission check that reaches a code path without a resolver denies access.

## Truthiness

A value used as a condition, or as an operand of `&&`, `||` or `!`, is converted to a boolean:

| Type | Truthy | Falsy |
|------|--------|-------|
| Null | | `null` |
| Boolean | `true` | `false` |
| Integer | non-zero | `0` |
| Float | non-zero | `0.0` |
| String | non-empty | `''` |
| Array | non-empty | `[]` |
| Object | non-empty | `{}` |

## Context variables

### Permission conditions

The server builds the context from the authenticated caller and the node being checked.

| Variable | Type | Description |
|----------|------|-------------|
| `auth.user_id` | String or null | Global identity (JWT subject) |
| `auth.local_user_id` | String or null | The caller's `raisin:User` node id in this repository |
| `auth.email` | String or null | |
| `auth.home` | String or null | Path of the caller's `raisin:User` node |
| `auth.is_anonymous` | Boolean | |
| `auth.is_system` | Boolean | |
| `auth.roles` | Array of strings | Effective role ids |
| `auth.groups` | Array of strings | Group ids |
| `node.id`, `node.name`, `node.path`, `node.node_type` | String | |
| `node.created_by`, `node.updated_by`, `node.owner_id`, `node.workspace` | String or null | |
| `node.<property>` | any | Every property of the node, by name |

Property values map to REL values as follows: strings, numbers, booleans, arrays and objects directly; dates and decimals as strings; a reference as the referenced node id; a URL as its string; a resource as its uuid; a vector as an array of floats. Element, composite and geometry values appear as `null`.

Permission evaluation is fail-closed. A parse error or an evaluation error (an undefined variable, a type error, a `RELATES` without a resolver) makes the condition `false`, and the permission does not apply. The error is logged as a warning.

### Workflow conditions and templates

Decision steps, loop steps, `or` container rules and `${...}` templates all share one context, built from the flow instance.

| Variable | Description |
|----------|-------------|
| `input` | The data the flow was started with |
| `trigger` | Trigger information, when the flow was started by a trigger |
| `steps.<step_id>` | The latest output of each completed step |
| `history.<step_id>` | Every output a step produced, in order, so `history.draft[0]` is the first attempt |
| `visits.<step_id>` | How many times a step has run; use it to bound a cycle, for example `visits.draft < 3` |
| `output` | The output of the step that just ran |
| `error` | Error details, when following an error edge |
| `<variable>` | Flow variables set by earlier steps, at the top level |

In a workflow, a parse or evaluation error fails the step with a condition-evaluation error; it is not silently `false`.

Human task groups evaluate `response_condition` against a smaller context: `response` (the response just submitted) and `responses` (the earlier responses in the group).

## Errors

Parse errors report a line and column, for example `Syntax error at line 1, column 4: Unexpected trailing input: +`. Evaluation errors include:

| Error | Cause |
|-------|-------|
| `Undefined variable: x` | Top-level name not in the context |
| `Property 'k' not found on object` | `obj['k']` with a missing key |
| `Index 9 out of bounds for array of length 3` | Array index out of range or negative |
| `Invalid index type: expected integer, got string` | Wrong index type for an array or object |
| `Type error in <op>: expected ..., got ...` | Operand of the wrong type, including `RELATES` in a synchronous context |
| `Cannot compare string with integer` | Ordering comparison across types |
| `Division by zero` | |
| `Unknown method: foo` | |
| `Wrong number of arguments for trim: expected 0, got 1` | |

## Grammar

```
expression     = or_expr
or_expr        = and_expr ( "||" and_expr )*
and_expr       = comparison ( "&&" comparison )*
comparison     = additive [ ( "==" | "!=" | "<" | ">" | "<=" | ">=" ) additive
                          | "RELATES" unary "VIA" relation_types
                            [ "DEPTH" integer ".." integer ]
                            [ "DIRECTION" ( "OUTGOING" | "INCOMING" | "ANY" ) ] ]
additive       = multiplicative ( ( "+" | "-" ) multiplicative )*
multiplicative = unary ( ( "*" | "/" | "%" ) unary )*
unary          = "!" unary | "-" unary | postfix
postfix        = atom ( "." name [ "(" [ expression ( "," expression )* ] ")" ]
                      | "[" expression "]" )*
atom           = "(" expression ")" | literal | identifier
literal        = "null" | "true" | "false" | number | string | array | object
array          = "[" [ literal ( "," literal )* ] "]"
object         = "{" [ key ":" literal ( "," key ":" literal )* ] "}"
key            = identifier | string
relation_types = string | "[" string ( "," string )* "]"
```

## Examples

```
// Comparisons
input.amount > 1000
input.status == 'active'
(input.priority >= 5 || input.urgent == true) && input.enabled == true

// Strings and arrays
input.category.contains('premium')
input.email.endsWith('@company.com')
input.tags.contains('vip')
input.items.length() > 0

// Paths
node.path.descendantOf('/content/blog')
node.path.startsWith(auth.home)
node.path.depth() <= 3

// Roles, groups and ownership (permission conditions)
auth.roles.contains('editor')
auth.groups.contains('admins')
node.created_by == auth.user_id
node.owner_id == auth.local_user_id

// Graph relationships (permission conditions)
node.created_by RELATES auth.local_user_id VIA 'FRIENDS_WITH'
node.created_by RELATES auth.local_user_id VIA 'MANAGES' DEPTH 1..3 DIRECTION OUTGOING

// Workflows
steps.critic.passed == false && visits.draft_email < 3
history.draft.length() >= 2
input.price * input.quantity > 10000
```
