---
sidebar_position: 7.5
---

# Coordinate Reference Systems (SRID)

RaisinDB stores a geometry's coordinate reference system **with the geometry** and
reprojects between systems for real. `ST_SRID` reports what a geometry is actually
in, `ST_SETSRID` corrects a wrong label, and `ST_TRANSFORM` converts coordinates.

:::info Previously
`ST_SRID` returned the constant `4326` for every input and there was no
`ST_TRANSFORM` at all. Both are now honest. A geometry with no CRS label still
reports `4326`, so nothing about existing queries or existing data changes.
:::

## Where the SRID lives

A geometry carries an optional `srid` member:

```json
{ "type": "Point", "coordinates": [2683000.0, 1247000.0], "srid": 2056 }
```

The member is **omitted for EPSG:4326**, which keeps ordinary output strictly
conformant with GeoJSON RFC 7946 (the RFC mandates 4326 and forbids declaring
another CRS, so the `srid` member is a documented extension used only when it has
to be). A geometry with no `srid` is *unlabelled*: it reports `4326`, and in a
binary operation it **adopts** the other operand's CRS.

Because the SRID travels inside the value, it survives function composition —
`ST_TRANSFORM(ST_UNION(a, b), 3857)` is meaningful. A sibling node property
(`location_srid`) could not do that, which is why this form was chosen.

You can also declare a default SRID per property in the NodeType schema, so a
workspace working entirely in a projected CRS need not repeat it on every write.

## The three functions

| Function | Coordinates | Label | Use it when |
|----------|-------------|-------|-------------|
| `ST_SRID(g)` | untouched | read | you want to know what CRS something is in |
| `ST_SETSRID(g, srid)` | **untouched** | overwritten | the label was wrong |
| `ST_TRANSFORM(g, srid)` | **recomputed** | overwritten | you want the data in another CRS |

:::danger ST_SETSRID does not move the geometry
This is the most common way a multi-CRS dataset becomes quietly wrong.

```sql
-- The numbers are already Swiss LV95 easting/northing, they just arrived
-- unlabelled. Fix the LABEL:
UPDATE 'sites' SET geom = ST_SETSRID(geom, 2056);

-- The numbers really are WGS84 degrees and you want LV95 metres.
-- CONVERT them:
SELECT ST_TRANSFORM(geom, 2056) FROM 'sites';
```

If the numbers should change, you want `ST_TRANSFORM`. `ST_SETSRID` only
re-describes them, so using it by mistake produces a geometry that *claims* one
CRS while its coordinates describe another — with no error anywhere.
:::

Both functions accept the target CRS as an integer or as text:
`4326`, `'EPSG:4326'`, `'epsg:4326'`, `'SRID=4326'`,
`'urn:ogc:def:crs:EPSG::4326'`. Foreign authorities are rejected on purpose:
`'ESRI:102100'` is *not* `EPSG:102100`, and silently treating it as one would be
exactly the kind of guess this design removes.

Deprecated WebMercator synonyms are canonicalised — `3785` and `900913` both
become `3857` — so `ST_SRID(a) = ST_SRID(b)` is not false for two geometries in the
same CRS.

## Axis order: always (longitude, latitude)

**`(x, y)` is `(longitude, latitude)` for geographic CRSs and
`(easting, northing)` for projected ones. Everywhere, for every EPSG code, on input
and on output.**

This deliberately diverges from the EPSG authority, which defines EPSG:4326 as
`(latitude, longitude)`. GeoJSON RFC 7946 §3.1.1, PostGIS, `geo-types`, the
`geohash` crate and every web mapping library are lon/lat; honouring authority
order would break interop with all of them and with data already stored. It is the
same call PostGIS and GeoJSON made.

Consequences worth knowing:

* The OGC URN form does **not** flip the axes.
  `ST_TRANSFORM(g, 'urn:ogc:def:crs:EPSG::4326')` means the same as
  `ST_TRANSFORM(g, 4326)`.
* There is no per-code axis flipping. If you supply an EPSG code whose
  authority-defined order differs from ours, your coordinates are interpreted as
  `(x, y)` regardless.

### The swap guard

`ST_POINT(47.37, 8.54)` — Zurich, reversed — used to pass silently and place the
point in Somalia. Now:

| Input | Behaviour |
|-------|-----------|
| `ST_POINT(47.37, 185.4)` | **error**, naming the corrected call `ST_POINT(185.4, 47.37)` |
| `ST_POINT(47.37, 8.54)` | accepted, with a one-time warning |
| `ST_POINT(200, 0)` | error, spelling out the `(longitude, latitude)` convention |

The middle case is genuinely undetectable — both ordinates are valid latitudes — so
it is accepted rather than rejected, because rejecting it would break every
legitimate point in that band. But it is no longer *silent*.

## What a default build can do

Coverage grows with Cargo features. **A default build needs no system libraries and
no C toolchain**, and already covers the CRSs most applications use:

| Tier | Cargo feature | Coverage | Build prerequisites |
|------|---------------|----------|---------------------|
| 1 | *(always on)* | EPSG:4326, EPSG:3857 (+3785/900913), all 120 WGS84 UTM zones | none |
| 2 | `proj` | ~1000 EPSG codes, pure Rust, WASM-safe | none |
| 3 | `proj-full` | full EPSG database + datum grids | see the warning below |

Tiers are tried highest-fidelity first, so enabling a wider one transparently
improves accuracy without any change to your SQL.

:::warning `proj-full` is more expensive than it looks
It links libproj. When `pkg-config` cannot find a system libproj, `proj-sys`
**compiles libproj 9.6.2 from bundled source**, which needs a C/C++ toolchain plus
sqlite3 and libtiff headers and is slow in CI. Neither projection feature is
enabled by default.
:::

### There is no silent fallback

When no compiled backend can perform a requested pair, `ST_TRANSFORM` **errors**,
and the message names both codes and the feature that would enable them:

```
no compiled backend can transform SRID 4326 -> SRID 31370.
Rebuild raisin-server with --features proj4rs-backend (pure Rust)
or proj-backend (needs libproj) to enable it
```

(`proj4rs-backend` and `proj-backend` are the underlying crate's feature names;
`raisin-server` exposes them as `proj` and `proj-full` respectively.)

Returning the input unprojected, or projecting approximately, would produce a
geometry wrong by hundreds of kilometres with nothing to indicate it. The same
applies to a coordinate with no image in the target CRS — a point above 85.05°N
against EPSG:3857, for example, where libproj otherwise returns a *finite*
northing twelve times the height of the whole Mercator world and reports success.

A transform is also **all-or-nothing**: one out-of-domain vertex fails the whole
geometry rather than emitting a half-projected ring, which would be a structurally
valid polygon describing nowhere.

## Why the spatial index is stricter than ST_TRANSFORM

The spatial index stores WGS84 lon/lat only — geohash cells are defined on degrees
— so a geometry is normalised to 4326 at **write** time. That normalisation is
restricted to **tier 1 alone, even on a build where tier 2 or 3 is compiled in**.

The reason is cluster determinism. RaisinDB is masterless: every node builds its own
local spatial index as replicated records arrive. If normalisation used "whatever
backend happens to be compiled in", a node built with `proj-full` would index an
EPSG:31370 geometry while a node without it would not — same replicated data,
divergent local indexes, and the same query returning different answers depending
on which node replied.

So:

* **Storing** a geometry whose SRID is outside tier 1 **fails the write**, loudly,
  with a message telling you to `ST_TRANSFORM(..., 4326)` first. It is never stored
  silently unindexed, because that would make `ST_DWITHIN` miss rows forever with no
  signal.
* **Querying** with `ST_TRANSFORM` may use any compiled backend, because a query
  result is per-request rather than shared state.

## SRID mismatch on a binary operation

Two geometries with **different explicit** SRIDs are an error, as in PostGIS:

```
ST_INTERSECTS: SRID mismatch (4326 vs 3857); wrap one side in ST_TRANSFORM
```

An implicit transform was rejected for two reasons: it silently changes the answer
and hides a data-modelling error, and on a build without the required backend it
would fail — making a query's success depend on which Cargo features the server was
built with.

The one exception is the adoption rule: an **unlabelled** geometry takes the other
operand's SRID. That is what lets

```sql
WHERE ST_DWITHIN(properties->>'loc', ST_POINT(8.54, 47.37), 500)
```

keep working when the stored value is labelled and the literal is not.

## Units per CRS class

Measurements are **geodesic on geographic CRSs and planar on projected ones**:

| Function | geographic (4326 …) | projected (3857, UTM …) |
|----------|---------------------|-------------------------|
| `ST_DISTANCE` | metres, geodesic | native CRS linear unit |
| `ST_DWITHIN(a, b, d)` | `d` in metres | `d` in native units |
| `ST_LENGTH` / `ST_PERIMETER` | metres | native units |
| `ST_AREA` | square metres | square native units |
| `ST_BUFFER(g, d)` | `d` in metres | `d` in native units |
| `ST_SIMPLIFY(g, t)` | `t` in metres | `t` in native units |
| `ST_AZIMUTH` | radians, geodesic | radians, planar |
| `__distance` on a spatial scan | metres | metres (the index is 4326) |

Two things to be aware of:

* **EPSG:3857 metres are Mercator-distorted.** The error is roughly `1/cos(latitude)`
  — about 1.5× at 48°N — so a length measured in 3857 is not a ground distance.
  This matches PostGIS. If you want ground truth, store 4326 or a UTM zone.
* **Topological predicates are planar in the geometry's own coordinate space.** On
  4326 that means straight lines in lon/lat, not great circles, so a polygon
  spanning the antimeridian or a `contains` test across a large longitudinal span
  behaves approximately — exactly as it does in PostGIS's `geometry` type. This is
  a documented limitation, not a bug.

See [Geospatial Functions](./geospatial-functions.md) for the full function
reference and the table of deliberate divergences from PostGIS.
