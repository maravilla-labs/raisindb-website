---
sidebar_position: 7.5
---

# Coordinate Reference Systems (SRID)

A geometry carries its coordinate reference system with it. `ST_SRID` reports
which CRS a geometry is in, `ST_SETSRID` changes the label without touching
the coordinates, and `ST_TRANSFORM` reprojects the coordinates into another
CRS.

## Where the SRID lives

A geometry may carry an `srid` member:

```json
{ "type": "Point", "coordinates": [2683000.0, 1247000.0], "srid": 2056 }
```

The member is omitted for EPSG:4326, so ordinary output stays plain GeoJSON
(RFC 7946 defines WGS84 as the only CRS). A geometry with no `srid` reports
`4326`, and in a two-argument function it adopts the other operand's CRS.

Because the SRID is inside the value it survives function composition:
`ST_TRANSFORM(ST_UNION(a, b), 3857)` is meaningful.

`ST_POINT` and `ST_MAKEPOINT` build 4326 points and check the coordinate
ranges, so a point in a projected CRS is written as GeoJSON:

```sql
SELECT ST_SRID(ST_GEOMFROMGEOJSON(
  '{"type":"Point","coordinates":[2683000,1247000],"srid":2056}'
));
-- 2056
```

## The three functions

| Function | Coordinates | Label | Use it when |
|----------|-------------|-------|-------------|
| `ST_SRID(g)` | untouched | read | you want to know the CRS |
| `ST_SETSRID(g, srid)` | untouched | overwritten | the label is wrong |
| `ST_TRANSFORM(g, srid)` | recomputed | overwritten | you want the data in another CRS |

`ST_SETSRID` only relabels. If the numbers are already Swiss LV95 metres but
arrived without a label, set the label; if they are WGS84 degrees and you want
LV95 metres, transform:

```sql
-- relabel
SELECT ST_SETSRID(properties->>'geom', 2056) FROM 'sites';

-- convert
SELECT ST_TRANSFORM(properties->>'geom', 2056) FROM 'sites';
```

Using `ST_SETSRID` where `ST_TRANSFORM` was meant produces a geometry whose
label and coordinates disagree, with no error, so it is worth checking which
one you need.

Both functions accept the target CRS as an integer or as text: `4326`,
`'EPSG:4326'`, `'epsg:4326'`, `'SRID=4326'`, `'urn:ogc:def:crs:EPSG::4326'`.
Other authorities such as `'ESRI:102100'` are rejected. The deprecated Web
Mercator codes `3785` and `900913` are read as `3857`.

```sql
SELECT ST_SRID(ST_POINT(8.54, 47.37)) AS s,
       ST_ASGEOJSON(ST_TRANSFORM(ST_POINT(8.54, 47.37), 3857)) AS mercator;
```

```json
{"rows":[{"s":4326,
          "mercator":"{\"type\":\"Point\",\"coordinates\":[950668.45,6002678.0],\"srid\":3857}"}]}
```

## Axis order: always (longitude, latitude)

`(x, y)` is `(longitude, latitude)` for geographic CRSs and
`(easting, northing)` for projected ones, on input and on output, for every
EPSG code. This matches GeoJSON, PostGIS and web mapping libraries, and it
differs from the EPSG registry's own axis definition of EPSG:4326
(latitude first).

- The URN form does not flip axes: `ST_TRANSFORM(g, 'urn:ogc:def:crs:EPSG::4326')`
  is the same as `ST_TRANSFORM(g, 4326)`.
- There is no per-code axis flipping.

### The swap guard

`ST_POINT` checks its arguments against the lon/lat ranges:

| Input | Behaviour |
|-------|-----------|
| `ST_POINT(47.37, 185.4)` | error: `ST_POINT takes (longitude, latitude); (47.37, 185.4) looks reversed — did you mean ST_POINT(185.4, 47.37)?` |
| `ST_POINT(200, 0)` | error: `longitude 200 out of range [-180, 180]. Coordinate order is (longitude, latitude)` |
| `ST_POINT(47.37, 8.54)` | accepted; the server logs a warning that the pair is ambiguous |

The last case cannot be detected, because both values are valid latitudes,
so it is accepted with a warning rather than rejected.

## Which CRSs a build supports

Coverage grows with Cargo features. A default build needs no system libraries:

| Tier | Cargo feature | Coverage | Build prerequisites |
|------|---------------|----------|---------------------|
| 1 | always on | EPSG:4326, EPSG:3857 (and 3785/900913), all 120 WGS84 UTM zones | none |
| 2 | `proj` | about 1000 EPSG codes, pure Rust | none |
| 3 | `proj-full` | full EPSG database and datum grids | libproj; see below |

Tiers are tried highest-fidelity first, so enabling a wider one improves
accuracy without changes to your SQL.

:::warning `proj-full` links libproj
When `pkg-config` cannot find a system libproj, the build compiles libproj
from bundled source, which needs a C/C++ toolchain plus sqlite3 and libtiff
headers and is slow. Neither projection feature is on by default.
:::

When no compiled backend can perform a requested transform, `ST_TRANSFORM`
returns an error that names both codes and the feature that would enable
them:

```
ST_TRANSFORM: no compiled backend can transform SRID 4326 -> SRID 2056.
Rebuild raisin-server with --features proj4rs-backend (pure Rust)
or proj-backend (needs libproj) to enable it
```

(`proj4rs-backend` and `proj-backend` are the underlying crate's feature
names; `raisin-server` exposes them as `proj` and `proj-full`.)

A coordinate with no image in the target CRS, such as a point above 85.05°N
against EPSG:3857, is also an error, and a transform is all-or-nothing: one
out-of-domain vertex fails the whole geometry.

## The spatial index stores WGS84

The spatial index is built on geohash cells, which are defined on degrees, so
a geometry is normalised to 4326 when it is written. That normalisation uses
tier 1 only, even on a build with tier 2 or 3, so that every node in a cluster
indexes the same replicated record the same way.

- Storing a geometry whose SRID is outside tier 1 fails the write with a
  message asking you to `ST_TRANSFORM(..., 4326)` first.
- Querying with `ST_TRANSFORM` may use any compiled backend.

## SRID mismatch in a two-argument function

Two geometries with different explicit SRIDs are an error, as in PostGIS:

```sql
SELECT ST_INTERSECTS(
  ST_GEOMFROMGEOJSON('{"type":"Point","coordinates":[1,1],"srid":2056}'),
  ST_TRANSFORM(ST_POINT(8.54, 47.37), 3857));
-- ST_INTERSECTS: SRID mismatch (2056 vs 3857); wrap one side in ST_TRANSFORM
```

A geometry in 4326 carries no label, so it counts as unlabelled and adopts
the other operand's SRID instead of raising the error. That is what lets

```sql
SELECT name FROM 'places'
WHERE ST_DWITHIN(properties->>'location', ST_POINT(8.54, 47.37), 500);
```

work when the stored value is labelled and the literal is not. It also means
that comparing a 4326 geometry with a 3857 one is not caught: the degrees are
read as metres and the result is simply wrong
(`ST_INTERSECTS(ST_POINT(8.54, 47.37), ST_TRANSFORM(ST_POINT(8.54, 47.37), 3857))`
returns `false`). Transform explicitly whenever one side is projected.

## Units per CRS class

Measurements are geodesic on geographic CRSs and planar on projected ones:

| Function | geographic (4326 …) | projected (3857, UTM …) |
|----------|---------------------|-------------------------|
| `ST_DISTANCE` | metres, geodesic | native linear unit |
| `ST_DWITHIN(a, b, d)` | `d` in metres | `d` in native units |
| `ST_LENGTH` / `ST_PERIMETER` | metres | native units |
| `ST_AREA` | square metres | square native units |
| `ST_BUFFER(g, d)` | `d` in metres | `d` in native units |
| `ST_SIMPLIFY(g, t)` | `t` in metres | `t` in native units |
| `ST_AZIMUTH` | radians, geodesic | radians, planar |
| `__distance` on a spatial scan | metres | metres (the index is 4326) |

Two things to keep in mind:

- EPSG:3857 metres are Mercator-distorted by roughly `1/cos(latitude)`. The
  same 0.01° of longitude at 47°N measures 753 m in 4326 and 1113 m in 3857.
  Store 4326 or a UTM zone when you need ground distance.
- Topological predicates are planar in the geometry's own coordinate space.
  On 4326 that means straight lines in lon/lat, not great circles, so a
  polygon spanning the antimeridian behaves approximately, as it does with
  PostGIS's `geometry` type.

See [Geospatial Functions](./geospatial-functions.md) for the full function
reference.
