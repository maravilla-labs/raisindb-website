---
sidebar_position: 7
---

# Geospatial Functions

PostGIS-compatible functions for spatial data operations.

## Geometry Constructors

### ST_POINT

Create a point geometry from longitude and latitude coordinates.

#### Syntax

```sql
ST_POINT(longitude, latitude) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| longitude | DOUBLE | X coordinate (longitude) |
| latitude | DOUBLE | Y coordinate (latitude) |

#### Return Value

GEOMETRY - Point geometry.

#### Examples

```sql
SELECT ST_POINT(-122.4194, 37.7749);
-- Result: Point geometry for San Francisco

-- Insert location
INSERT INTO stores (name, location)
VALUES ('Downtown Store', ST_POINT(-122.4194, 37.7749));

-- Create from columns
SELECT
    name,
    ST_POINT(lon, lat) AS location
FROM locations;
```

---

### ST_GEOMFROMGEOJSON

Parse GeoJSON text to create a geometry.

#### Syntax

```sql
ST_GEOMFROMGEOJSON(geojson_text) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geojson_text | TEXT | GeoJSON string |

#### Return Value

GEOMETRY - Parsed geometry.

#### Examples

```sql
-- Point from GeoJSON
SELECT ST_GEOMFROMGEOJSON('{
    "type": "Point",
    "coordinates": [-122.4194, 37.7749]
}');

-- Polygon from GeoJSON
SELECT ST_GEOMFROMGEOJSON('{
    "type": "Polygon",
    "coordinates": [[
        [-122.5, 37.7],
        [-122.5, 37.8],
        [-122.4, 37.8],
        [-122.4, 37.7],
        [-122.5, 37.7]
    ]]
}');

-- LineString from GeoJSON
SELECT ST_GEOMFROMGEOJSON('{
    "type": "LineString",
    "coordinates": [
        [-122.4194, 37.7749],
        [-122.4089, 37.7858]
    ]
}');
```

---

## Output Functions

### ST_ASGEOJSON

Convert geometry to GeoJSON text representation.

#### Syntax

```sql
ST_ASGEOJSON(geometry) → TEXT
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geometry | GEOMETRY | Geometry to convert |

#### Return Value

TEXT - GeoJSON string.

#### Examples

```sql
SELECT ST_ASGEOJSON(ST_POINT(-122.4194, 37.7749));
-- Result: '{"type":"Point","coordinates":[-122.4194,37.7749]}'

SELECT
    name,
    ST_ASGEOJSON(location) AS geojson
FROM stores;

-- For API responses
SELECT
    name,
    ST_ASGEOJSON(boundary) AS area_geojson
FROM regions;
```

---

## Accessor Functions

### ST_X

Get the X coordinate (longitude) of a point geometry.

#### Syntax

```sql
ST_X(point) → DOUBLE
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| point | GEOMETRY | Point geometry |

#### Return Value

DOUBLE - X coordinate (longitude), or NULL if not a point.

#### Examples

```sql
SELECT ST_X(ST_POINT(-122.4194, 37.7749));
-- Result: -122.4194

SELECT
    name,
    ST_X(location) AS longitude
FROM stores;
```

---

### ST_Y

Get the Y coordinate (latitude) of a point geometry.

#### Syntax

```sql
ST_Y(point) → DOUBLE
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| point | GEOMETRY | Point geometry |

#### Return Value

DOUBLE - Y coordinate (latitude), or NULL if not a point.

#### Examples

```sql
SELECT ST_Y(ST_POINT(-122.4194, 37.7749));
-- Result: 37.7749

SELECT
    name,
    ST_Y(location) AS latitude
FROM stores;

-- Extract both coordinates
SELECT
    name,
    ST_X(location) AS lon,
    ST_Y(location) AS lat
FROM stores;
```

---

## Distance Functions

### ST_DISTANCE

Calculate the distance between two geometries in meters.

#### Syntax

```sql
ST_DISTANCE(geometry1, geometry2) → DOUBLE
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geometry1 | GEOMETRY | First geometry |
| geometry2 | GEOMETRY | Second geometry |

#### Return Value

DOUBLE - Distance in meters.

#### Examples

```sql
-- Distance between two points
SELECT ST_DISTANCE(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-122.4089, 37.7858)
);
-- Result: distance in meters

-- Find nearby stores
SELECT
    name,
    ST_DISTANCE(
        location,
        ST_POINT(-122.4194, 37.7749)
    ) AS distance_meters
FROM stores
ORDER BY distance_meters
LIMIT 10;

-- Distance from user location
SELECT
    s.name,
    ST_DISTANCE(s.location, u.current_location) AS distance
FROM stores s
CROSS JOIN user_location u
WHERE u.user_id = '550e8400-e29b-41d4-a716-446655440000';
```

#### Notes

- Returns distance in meters
- Uses WGS84 spheroid for accuracy
- Works with points, lines, polygons

---

### ST_DWITHIN

Check if two geometries are within a specified distance.

#### Syntax

```sql
ST_DWITHIN(geometry1, geometry2, distance_meters) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geometry1 | GEOMETRY | First geometry |
| geometry2 | GEOMETRY | Second geometry |
| distance_meters | DOUBLE | Distance threshold in meters |

#### Return Value

BOOLEAN - true if geometries are within distance, false otherwise.

#### Examples

```sql
-- Check if within 1km
SELECT ST_DWITHIN(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-122.4089, 37.7858),
    1000
);

-- Find stores within 5km
SELECT name, location
FROM stores
WHERE ST_DWITHIN(
    location,
    ST_POINT(-122.4194, 37.7749),
    5000
);

-- Count nearby locations
SELECT COUNT(*) AS nearby_count
FROM locations
WHERE ST_DWITHIN(
    location,
    ST_POINT(-122.4194, 37.7749),
    1000
);
```

#### Notes

- More efficient than ST_DISTANCE for filtering
- Uses spatial index when available
- Distance in meters

---

## Spatial Predicates

### ST_CONTAINS

Check if geometry A contains geometry B.

#### Syntax

```sql
ST_CONTAINS(geometry_a, geometry_b) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geometry_a | GEOMETRY | Container geometry |
| geometry_b | GEOMETRY | Contained geometry |

#### Return Value

BOOLEAN - true if A contains B, false otherwise.

#### Examples

```sql
-- Check if polygon contains point
SELECT ST_CONTAINS(
    ST_GEOMFROMGEOJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-122.5, 37.7],
            [-122.5, 37.8],
            [-122.4, 37.8],
            [-122.4, 37.7],
            [-122.5, 37.7]
        ]]
    }'),
    ST_POINT(-122.45, 37.75)
);

-- Find points in region
SELECT p.name
FROM points p
JOIN regions r ON ST_CONTAINS(r.boundary, p.location)
WHERE r.name = 'Downtown';

-- Filter by containment
SELECT * FROM stores
WHERE ST_CONTAINS(
    (SELECT boundary FROM regions WHERE name = 'Service Area'),
    location
);
```

---

### ST_WITHIN

Check if geometry A is within geometry B.

#### Syntax

```sql
ST_WITHIN(geometry_a, geometry_b) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geometry_a | GEOMETRY | Inner geometry |
| geometry_b | GEOMETRY | Outer geometry |

#### Return Value

BOOLEAN - true if A is within B, false otherwise.

#### Examples

```sql
-- Check if point is within polygon
SELECT ST_WITHIN(
    ST_POINT(-122.45, 37.75),
    ST_GEOMFROMGEOJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-122.5, 37.7],
            [-122.5, 37.8],
            [-122.4, 37.8],
            [-122.4, 37.7],
            [-122.5, 37.7]
        ]]
    }')
);

-- Find stores in service area
SELECT name FROM stores
WHERE ST_WITHIN(
    location,
    (SELECT boundary FROM regions WHERE name = 'Service Area')
);
```

#### Notes

- Inverse of ST_CONTAINS
- `ST_WITHIN(A, B)` equals `ST_CONTAINS(B, A)`

---

### ST_INTERSECTS

Check if two geometries intersect (share any space).

#### Syntax

```sql
ST_INTERSECTS(geometry1, geometry2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geometry1 | GEOMETRY | First geometry |
| geometry2 | GEOMETRY | Second geometry |

#### Return Value

BOOLEAN - true if geometries intersect, false otherwise.

#### Examples

```sql
-- Check if geometries intersect
SELECT ST_INTERSECTS(
    ST_GEOMFROMGEOJSON('{"type":"LineString","coordinates":[...]}'),
    ST_GEOMFROMGEOJSON('{"type":"Polygon","coordinates":[...]}')
);

-- Find intersecting regions
SELECT r1.name, r2.name
FROM regions r1
JOIN regions r2 ON ST_INTERSECTS(r1.boundary, r2.boundary)
WHERE r1.id < r2.id;

-- Find routes through area
SELECT route_name
FROM routes
WHERE ST_INTERSECTS(
    path,
    (SELECT boundary FROM regions WHERE name = 'Downtown')
);
```

---

## Complete Examples

### Nearby Search

```sql
-- Find stores within 5km, sorted by distance
SELECT
    name,
    address,
    ST_DISTANCE(location, ST_POINT(-122.4194, 37.7749)) AS distance_meters
FROM stores
WHERE ST_DWITHIN(location, ST_POINT(-122.4194, 37.7749), 5000)
ORDER BY distance_meters
LIMIT 10;
```

### Region Containment

```sql
-- Find all points within a region
SELECT
    p.name,
    p.category,
    ST_X(p.location) AS longitude,
    ST_Y(p.location) AS latitude
FROM points_of_interest p
WHERE ST_CONTAINS(
    (SELECT boundary FROM regions WHERE name = 'Downtown'),
    p.location
);
```

### Distance Matrix

```sql
-- Calculate distances between all stores
SELECT
    s1.name AS from_store,
    s2.name AS to_store,
    ST_DISTANCE(s1.location, s2.location) AS distance_meters
FROM stores s1
CROSS JOIN stores s2
WHERE s1.id < s2.id
ORDER BY distance_meters;
```

### Spatial Join

```sql
-- Count points per region
SELECT
    r.name AS region_name,
    COUNT(p.id) AS point_count
FROM regions r
LEFT JOIN points p ON ST_CONTAINS(r.boundary, p.location)
GROUP BY r.name
ORDER BY point_count DESC;
```

### Route Analysis

```sql
-- Find routes intersecting multiple regions
SELECT
    rt.name AS route_name,
    ARRAY_AGG(rg.name) AS intersected_regions
FROM routes rt
JOIN regions rg ON ST_INTERSECTS(rt.path, rg.boundary)
GROUP BY rt.name
HAVING COUNT(rg.id) > 1;
```

### Closest Point

```sql
-- Find nearest store to user location
SELECT
    name,
    address,
    ST_DISTANCE(location, ST_POINT(-122.4194, 37.7749)) AS distance
FROM stores
ORDER BY distance
LIMIT 1;
```

### Coverage Check

```sql
-- Check if all points are covered by service areas
SELECT
    p.name,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM service_areas sa
            WHERE ST_CONTAINS(sa.boundary, p.location)
        ) THEN 'Covered'
        ELSE 'Not Covered'
    END AS coverage_status
FROM points p;
```

### Buffer Zone

```sql
-- Find locations within 1km of a route
SELECT
    loc.name,
    ST_DISTANCE(loc.location, route.path) AS distance_to_route
FROM locations loc
CROSS JOIN routes route
WHERE route.id = '550e8400-e29b-41d4-a716-446655440000'
  AND ST_DWITHIN(loc.location, route.path, 1000)
ORDER BY distance_to_route;
```

---

## Notes

- All distance calculations use meters
- Coordinates are in WGS84 (longitude, latitude)
- Longitude is X coordinate, Latitude is Y coordinate
- Functions use spheroid calculations for accuracy
- Spatial indexes improve query performance
- GeoJSON format: `[longitude, latitude]` (X, Y order)
- Compatible with PostGIS conventions
- Supports Point, LineString, Polygon geometries
