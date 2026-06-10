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

### ST_MAKEPOINT

Create a point geometry from X and Y coordinates. Alias for ST_POINT following PostGIS naming conventions.

#### Syntax

```sql
ST_MAKEPOINT(x, y) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| x | DOUBLE | X coordinate (longitude) |
| y | DOUBLE | Y coordinate (latitude) |

#### Return Value

GEOMETRY - Point geometry.

#### Examples

```sql
SELECT ST_MAKEPOINT(-73.9857, 40.7484);
-- Result: Point geometry for Empire State Building

SELECT name, ST_MAKEPOINT(lon, lat) AS location
FROM addresses;
```

---

### ST_MAKELINE

Create a LineString geometry from two points.

#### Syntax

```sql
ST_MAKELINE(point1, point2) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| point1 | GEOMETRY | Start point |
| point2 | GEOMETRY | End point |

#### Return Value

GEOMETRY - LineString geometry connecting the two points.

#### Examples

```sql
-- Create a line between two cities
SELECT ST_MAKELINE(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-118.2437, 34.0522)
);

-- Connect store to warehouse
SELECT ST_MAKELINE(s.location, w.location) AS route
FROM stores s, warehouses w
WHERE s.id = '1' AND w.id = '1';
```

---

### ST_MAKEPOLYGON

Create a Polygon geometry from a closed LineString.

#### Syntax

```sql
ST_MAKEPOLYGON(linestring) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| linestring | GEOMETRY | Closed LineString (first and last points must match) |

#### Return Value

GEOMETRY - Polygon geometry.

#### Examples

```sql
-- Create a polygon from a closed LineString
SELECT ST_MAKEPOLYGON(
    ST_GEOMFROMGEOJSON('{
        "type": "LineString",
        "coordinates": [
            [-122.5, 37.7], [-122.5, 37.8],
            [-122.4, 37.8], [-122.4, 37.7],
            [-122.5, 37.7]
        ]
    }')
);
```

---

### ST_MAKEENVELOPE

Create a rectangular Polygon from bounding box coordinates.

#### Syntax

```sql
ST_MAKEENVELOPE(xmin, ymin, xmax, ymax) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| xmin | DOUBLE | Minimum X (west longitude) |
| ymin | DOUBLE | Minimum Y (south latitude) |
| xmax | DOUBLE | Maximum X (east longitude) |
| ymax | DOUBLE | Maximum Y (north latitude) |

#### Return Value

GEOMETRY - Rectangular Polygon geometry.

#### Examples

```sql
-- Bounding box for San Francisco
SELECT ST_MAKEENVELOPE(-122.52, 37.70, -122.35, 37.82);

-- Find stores within a bounding box
SELECT name FROM stores
WHERE ST_WITHIN(location, ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8));
```

---

### ST_COLLECT

Collect two geometries into a GeometryCollection.

#### Syntax

```sql
ST_COLLECT(geom1, geom2) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom1 | GEOMETRY | First geometry |
| geom2 | GEOMETRY | Second geometry |

#### Return Value

GEOMETRY - GeometryCollection containing both geometries.

#### Examples

```sql
-- Collect two points
SELECT ST_COLLECT(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-118.2437, 34.0522)
);

-- Collect store and warehouse locations
SELECT ST_COLLECT(s.location, w.location) AS combined
FROM stores s, warehouses w
WHERE s.region = w.region;
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

## Geometry Info Functions

### ST_GEOMETRYTYPE

Returns the geometry type as a string.

#### Syntax

```sql
ST_GEOMETRYTYPE(geom) → TEXT
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

TEXT - Type string such as "ST_Point", "ST_LineString", "ST_Polygon", etc.

#### Examples

```sql
SELECT ST_GEOMETRYTYPE(ST_POINT(-122.4194, 37.7749));
-- Result: 'ST_Point'

SELECT name, ST_GEOMETRYTYPE(geom) AS type
FROM spatial_data;
```

---

### ST_NUMPOINTS

Returns the number of coordinate points in a geometry.

#### Syntax

```sql
ST_NUMPOINTS(geom) → INTEGER
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

INTEGER - Count of coordinate points.

#### Examples

```sql
SELECT ST_NUMPOINTS(ST_MAKELINE(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-118.2437, 34.0522)
));
-- Result: 2

SELECT name, ST_NUMPOINTS(boundary) AS vertex_count
FROM regions;
```

---

### ST_NUMGEOMETRIES

Returns the number of sub-geometries in a collection, or 1 for simple geometry types.

#### Syntax

```sql
ST_NUMGEOMETRIES(geom) → INTEGER
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

INTEGER - Count of sub-geometries.

#### Examples

```sql
SELECT ST_NUMGEOMETRIES(ST_POINT(-122.4194, 37.7749));
-- Result: 1

SELECT ST_NUMGEOMETRIES(
    ST_COLLECT(ST_POINT(-122.4, 37.7), ST_POINT(-118.2, 34.0))
);
-- Result: 2
```

---

### ST_SRID

Returns the Spatial Reference System Identifier of a geometry.

#### Syntax

```sql
ST_SRID(geom) → INTEGER
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

INTEGER - SRID value (4326 for WGS84).

#### Examples

```sql
SELECT ST_SRID(ST_POINT(-122.4194, 37.7749));
-- Result: 4326

SELECT name FROM spatial_data
WHERE ST_SRID(geom) = 4326;
```

---

### ST_ISVALID

Check if a geometry is topologically valid.

#### Syntax

```sql
ST_ISVALID(geom) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

BOOLEAN - true if the geometry is valid, false otherwise.

#### Examples

```sql
SELECT ST_ISVALID(ST_POINT(-122.4194, 37.7749));
-- Result: true

-- Find invalid geometries
SELECT name FROM regions
WHERE NOT ST_ISVALID(boundary);
```

---

### ST_ISEMPTY

Check if a geometry has no coordinates.

#### Syntax

```sql
ST_ISEMPTY(geom) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

BOOLEAN - true if the geometry is empty, false otherwise.

#### Examples

```sql
SELECT ST_ISEMPTY(ST_POINT(-122.4194, 37.7749));
-- Result: false

-- Filter out empty geometries
SELECT name FROM spatial_data
WHERE NOT ST_ISEMPTY(geom);
```

---

### ST_ISCLOSED

Check if a LineString is closed (first point equals last point).

#### Syntax

```sql
ST_ISCLOSED(geom) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | LineString geometry |

#### Return Value

BOOLEAN - true if the LineString is closed, false otherwise.

#### Examples

```sql
-- A closed ring
SELECT ST_ISCLOSED(ST_GEOMFROMGEOJSON('{
    "type": "LineString",
    "coordinates": [
        [-122.5, 37.7], [-122.4, 37.7],
        [-122.4, 37.8], [-122.5, 37.7]
    ]
}'));
-- Result: true

-- Find open routes that don't return to start
SELECT name FROM routes
WHERE NOT ST_ISCLOSED(path);
```

---

### ST_ISSIMPLE

Check if a geometry has no self-intersections.

#### Syntax

```sql
ST_ISSIMPLE(geom) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

BOOLEAN - true if the geometry has no self-intersections, false otherwise.

#### Examples

```sql
SELECT ST_ISSIMPLE(ST_MAKELINE(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-118.2437, 34.0522)
));
-- Result: true

-- Find self-intersecting routes
SELECT name FROM routes
WHERE NOT ST_ISSIMPLE(path);
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

## Measurement Functions

### ST_AREA

Calculate the area of a geometry in square meters.

#### Syntax

```sql
ST_AREA(geom) → DOUBLE
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry (Polygon or MultiPolygon) |

#### Return Value

DOUBLE - Area in square meters. Returns 0 for Point and LineString geometries.

#### Examples

```sql
-- Area of a polygon
SELECT ST_AREA(ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8));

-- Compare region sizes
SELECT
    name,
    ST_AREA(boundary) AS area_sq_meters,
    ST_AREA(boundary) / 1000000.0 AS area_sq_km
FROM regions
ORDER BY area_sq_meters DESC;
```

---

### ST_LENGTH

Calculate the length of a geometry in meters.

#### Syntax

```sql
ST_LENGTH(geom) → DOUBLE
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry (LineString or Polygon perimeter) |

#### Return Value

DOUBLE - Length in meters.

#### Examples

```sql
-- Length of a route
SELECT ST_LENGTH(ST_MAKELINE(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-118.2437, 34.0522)
)) AS route_length_meters;

-- Find longest routes
SELECT name, ST_LENGTH(path) AS length_meters
FROM routes
ORDER BY length_meters DESC
LIMIT 5;
```

---

### ST_PERIMETER

Calculate the perimeter of a Polygon in meters.

#### Syntax

```sql
ST_PERIMETER(geom) → DOUBLE
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Polygon geometry |

#### Return Value

DOUBLE - Perimeter of the exterior ring in meters.

#### Examples

```sql
-- Perimeter of a bounding box
SELECT ST_PERIMETER(ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8));

-- Compare region perimeters
SELECT name, ST_PERIMETER(boundary) AS perimeter_meters
FROM regions
ORDER BY perimeter_meters DESC;
```

---

### ST_AZIMUTH

Calculate the bearing between two points in radians.

#### Syntax

```sql
ST_AZIMUTH(point1, point2) → DOUBLE
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| point1 | GEOMETRY | Origin point |
| point2 | GEOMETRY | Destination point |

#### Return Value

DOUBLE - Bearing in radians (0 = north, pi/2 = east, pi = south, 3*pi/2 = west).

#### Examples

```sql
-- Bearing from SF to LA
SELECT ST_AZIMUTH(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-118.2437, 34.0522)
);

-- Convert to degrees
SELECT DEGREES(ST_AZIMUTH(
    ST_POINT(-122.4194, 37.7749),
    ST_POINT(-118.2437, 34.0522)
)) AS bearing_degrees;
```

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

### ST_DISJOINT

Check if two geometries do not intersect. Opposite of ST_INTERSECTS.

#### Syntax

```sql
ST_DISJOINT(g1, g2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

BOOLEAN - true if geometries do not share any space, false otherwise.

#### Examples

```sql
-- Check if two regions are separate
SELECT ST_DISJOINT(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8),
    ST_MAKEENVELOPE(-118.3, 34.0, -118.2, 34.1)
);
-- Result: true (SF and LA don't overlap)

-- Find stores outside a restricted zone
SELECT name FROM stores
WHERE ST_DISJOINT(
    location,
    (SELECT boundary FROM zones WHERE name = 'Restricted')
);
```

---

### ST_EQUALS

Check if two geometries are topologically equal.

#### Syntax

```sql
ST_EQUALS(g1, g2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

BOOLEAN - true if geometries are topologically equal, false otherwise.

#### Examples

```sql
-- Same point, different construction
SELECT ST_EQUALS(
    ST_POINT(-122.4194, 37.7749),
    ST_MAKEPOINT(-122.4194, 37.7749)
);
-- Result: true

-- Find duplicate regions
SELECT r1.name, r2.name
FROM regions r1
JOIN regions r2 ON ST_EQUALS(r1.boundary, r2.boundary)
WHERE r1.id < r2.id;
```

---

### ST_TOUCHES

Check if geometry boundaries touch but interiors do not intersect.

#### Syntax

```sql
ST_TOUCHES(g1, g2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

BOOLEAN - true if boundaries touch but interiors do not intersect, false otherwise.

#### Examples

```sql
-- Adjacent regions that share a border
SELECT ST_TOUCHES(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8),
    ST_MAKEENVELOPE(-122.4, 37.7, -122.3, 37.8)
);
-- Result: true (they share the -122.4 edge)

-- Find adjacent delivery zones
SELECT z1.name, z2.name
FROM zones z1
JOIN zones z2 ON ST_TOUCHES(z1.boundary, z2.boundary)
WHERE z1.id < z2.id;
```

---

### ST_CROSSES

Check if a geometry crosses another (e.g., a line passing through a polygon).

#### Syntax

```sql
ST_CROSSES(g1, g2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

BOOLEAN - true if the geometry crosses the other, false otherwise.

#### Examples

```sql
-- Does a route cross through a region?
SELECT ST_CROSSES(
    ST_MAKELINE(ST_POINT(-122.5, 37.7), ST_POINT(-122.3, 37.9)),
    ST_MAKEENVELOPE(-122.45, 37.75, -122.40, 37.80)
);

-- Find routes that cross restricted zones
SELECT r.name FROM routes r
JOIN zones z ON ST_CROSSES(r.path, z.boundary)
WHERE z.type = 'restricted';
```

---

### ST_OVERLAPS

Check if two same-dimension geometries overlap without full containment.

#### Syntax

```sql
ST_OVERLAPS(g1, g2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

BOOLEAN - true if the geometries overlap but neither contains the other, false otherwise.

#### Examples

```sql
-- Two partially overlapping regions
SELECT ST_OVERLAPS(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8),
    ST_MAKEENVELOPE(-122.45, 37.75, -122.35, 37.85)
);
-- Result: true

-- Find overlapping service areas
SELECT s1.name, s2.name
FROM service_areas s1
JOIN service_areas s2 ON ST_OVERLAPS(s1.boundary, s2.boundary)
WHERE s1.id < s2.id;
```

---

### ST_COVERS

Check if no point of geometry B is outside geometry A (includes boundary points).

#### Syntax

```sql
ST_COVERS(g1, g2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | Covering geometry |
| g2 | GEOMETRY | Covered geometry |

#### Return Value

BOOLEAN - true if A covers B (no point of B is outside A), false otherwise.

#### Examples

```sql
-- Does the service area cover the store?
SELECT ST_COVERS(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8),
    ST_POINT(-122.45, 37.75)
);
-- Result: true

-- Find regions that fully cover a delivery zone
SELECT r.name
FROM regions r
WHERE ST_COVERS(r.boundary, (SELECT boundary FROM zones WHERE name = 'Zone A'));
```

---

### ST_COVEREDBY

Check if geometry A is covered by geometry B. Inverse of ST_COVERS.

#### Syntax

```sql
ST_COVEREDBY(g1, g2) → BOOLEAN
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | Geometry to check |
| g2 | GEOMETRY | Covering geometry |

#### Return Value

BOOLEAN - true if A is covered by B, false otherwise.

#### Examples

```sql
-- Is the store inside the service area?
SELECT ST_COVEREDBY(
    ST_POINT(-122.45, 37.75),
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8)
);
-- Result: true

-- Find stores covered by at least one delivery zone
SELECT s.name FROM stores s
WHERE EXISTS (
    SELECT 1 FROM zones z
    WHERE ST_COVEREDBY(s.location, z.boundary)
);
```

---

## Geometry Processing

### ST_BUFFER

Create a buffer zone around a geometry at a specified distance.

#### Syntax

```sql
ST_BUFFER(geom, distance_meters) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |
| distance_meters | DOUBLE | Buffer distance in meters |

#### Return Value

GEOMETRY - Polygon representing the buffer zone.

#### Examples

```sql
-- 1km buffer around a point
SELECT ST_BUFFER(ST_POINT(-122.4194, 37.7749), 1000);

-- Create delivery radius around stores
SELECT
    name,
    ST_BUFFER(location, 5000) AS delivery_zone
FROM stores;
```

---

### ST_CENTROID

Calculate the geometric centroid of a geometry.

#### Syntax

```sql
ST_CENTROID(geom) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

GEOMETRY - Point at the centroid.

#### Examples

```sql
-- Center of a region
SELECT ST_ASGEOJSON(ST_CENTROID(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8)
));

-- Find center of each delivery zone
SELECT name, ST_CENTROID(boundary) AS center
FROM zones;
```

---

### ST_ENVELOPE

Return the bounding box of a geometry as a Polygon.

#### Syntax

```sql
ST_ENVELOPE(geom) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

GEOMETRY - Rectangular Polygon representing the bounding box.

#### Examples

```sql
-- Bounding box of a complex polygon
SELECT ST_ASGEOJSON(ST_ENVELOPE(boundary)) AS bbox
FROM regions
WHERE name = 'Downtown';

-- Compare area of geometry vs its bounding box
SELECT
    name,
    ST_AREA(boundary) AS actual_area,
    ST_AREA(ST_ENVELOPE(boundary)) AS bbox_area
FROM regions;
```

---

### ST_CONVEXHULL

Compute the convex hull of a geometry.

#### Syntax

```sql
ST_CONVEXHULL(geom) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

GEOMETRY - Polygon representing the convex hull.

#### Examples

```sql
-- Convex hull of a collection of points
SELECT ST_CONVEXHULL(
    ST_COLLECT(ST_POINT(-122.4, 37.7), ST_POINT(-122.5, 37.8))
);

-- Coverage area for a set of stores
SELECT ST_ASGEOJSON(ST_CONVEXHULL(
    ST_COLLECT(s1.location, s2.location)
)) AS coverage
FROM stores s1, stores s2
WHERE s1.id < s2.id;
```

---

### ST_SIMPLIFY

Simplify a geometry using the Douglas-Peucker algorithm.

#### Syntax

```sql
ST_SIMPLIFY(geom, tolerance) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |
| tolerance | DOUBLE | Simplification tolerance (in degrees for WGS84) |

#### Return Value

GEOMETRY - Simplified geometry with fewer vertices.

#### Examples

```sql
-- Simplify a complex boundary for display
SELECT ST_SIMPLIFY(boundary, 0.001) AS simplified
FROM regions
WHERE name = 'Service Area';

-- Reduce detail for overview maps
SELECT
    name,
    ST_NUMPOINTS(boundary) AS original_points,
    ST_NUMPOINTS(ST_SIMPLIFY(boundary, 0.01)) AS simplified_points
FROM regions;
```

---

### ST_REVERSE

Reverse the coordinate order of a geometry.

#### Syntax

```sql
ST_REVERSE(geom) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

GEOMETRY - Geometry with reversed coordinate order.

#### Examples

```sql
-- Reverse a route direction
SELECT ST_REVERSE(path) AS return_route
FROM routes
WHERE name = 'Delivery Route A';

-- Swap start and end of a line
SELECT
    ST_ASGEOJSON(ST_STARTPOINT(ST_REVERSE(path))) AS new_start
FROM routes;
```

---

### ST_BOUNDARY

Return the boundary of a geometry.

#### Syntax

```sql
ST_BOUNDARY(geom) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| geom | GEOMETRY | Input geometry |

#### Return Value

GEOMETRY - Boundary of the geometry (e.g., LineString ring for a Polygon).

#### Examples

```sql
-- Get the border of a region
SELECT ST_ASGEOJSON(ST_BOUNDARY(boundary)) AS border
FROM regions
WHERE name = 'Downtown';

-- Length of a region's border
SELECT name, ST_LENGTH(ST_BOUNDARY(boundary)) AS border_length
FROM regions;
```

---

## Set Operations

### ST_UNION

Compute the union of two geometries.

#### Syntax

```sql
ST_UNION(g1, g2) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

GEOMETRY - Combined geometry covering the area of both inputs.

#### Examples

```sql
-- Merge two delivery zones
SELECT ST_UNION(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8),
    ST_MAKEENVELOPE(-122.45, 37.75, -122.35, 37.85)
) AS merged_zone;

-- Combine adjacent service areas
SELECT ST_UNION(z1.boundary, z2.boundary) AS combined
FROM zones z1, zones z2
WHERE z1.name = 'Zone A' AND z2.name = 'Zone B';
```

---

### ST_INTERSECTION

Compute the intersection of two geometries.

#### Syntax

```sql
ST_INTERSECTION(g1, g2) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

GEOMETRY - Geometry representing the shared area.

#### Examples

```sql
-- Find overlapping area between two zones
SELECT ST_INTERSECTION(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8),
    ST_MAKEENVELOPE(-122.45, 37.75, -122.35, 37.85)
) AS overlap;

-- Area of overlap between delivery zones
SELECT
    z1.name, z2.name,
    ST_AREA(ST_INTERSECTION(z1.boundary, z2.boundary)) AS overlap_area
FROM zones z1
JOIN zones z2 ON ST_INTERSECTS(z1.boundary, z2.boundary)
WHERE z1.id < z2.id;
```

---

### ST_DIFFERENCE

Compute the difference of two geometries (A minus B).

#### Syntax

```sql
ST_DIFFERENCE(g1, g2) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | Base geometry |
| g2 | GEOMETRY | Geometry to subtract |

#### Return Value

GEOMETRY - Part of g1 that does not intersect with g2.

#### Examples

```sql
-- Remove restricted area from delivery zone
SELECT ST_DIFFERENCE(
    (SELECT boundary FROM zones WHERE name = 'Delivery Zone'),
    (SELECT boundary FROM zones WHERE name = 'Restricted Area')
) AS adjusted_zone;

-- Service area excluding competitor coverage
SELECT ST_DIFFERENCE(our.boundary, their.boundary) AS exclusive_area
FROM service_areas our, competitor_areas their
WHERE our.name = 'West Side';
```

---

### ST_SYMDIFFERENCE

Compute the symmetric difference of two geometries (areas in either but not both).

#### Syntax

```sql
ST_SYMDIFFERENCE(g1, g2) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| g1 | GEOMETRY | First geometry |
| g2 | GEOMETRY | Second geometry |

#### Return Value

GEOMETRY - Areas that belong to exactly one of the two geometries.

#### Examples

```sql
-- Find non-overlapping parts of two zones
SELECT ST_SYMDIFFERENCE(
    ST_MAKEENVELOPE(-122.5, 37.7, -122.4, 37.8),
    ST_MAKEENVELOPE(-122.45, 37.75, -122.35, 37.85)
) AS exclusive_areas;

-- Unique coverage per zone
SELECT ST_AREA(ST_SYMDIFFERENCE(z1.boundary, z2.boundary)) AS unique_area
FROM zones z1, zones z2
WHERE z1.name = 'Zone A' AND z2.name = 'Zone B';
```

---

## Line Functions

### ST_STARTPOINT

Return the first point of a LineString.

#### Syntax

```sql
ST_STARTPOINT(linestring) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| linestring | GEOMETRY | LineString geometry |

#### Return Value

GEOMETRY - First point of the LineString.

#### Examples

```sql
-- Get start of a route
SELECT ST_ASGEOJSON(ST_STARTPOINT(path)) AS start_point
FROM routes
WHERE name = 'Delivery Route A';

-- Starting coordinates
SELECT
    name,
    ST_X(ST_STARTPOINT(path)) AS start_lon,
    ST_Y(ST_STARTPOINT(path)) AS start_lat
FROM routes;
```

---

### ST_ENDPOINT

Return the last point of a LineString.

#### Syntax

```sql
ST_ENDPOINT(linestring) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| linestring | GEOMETRY | LineString geometry |

#### Return Value

GEOMETRY - Last point of the LineString.

#### Examples

```sql
-- Get destination of a route
SELECT ST_ASGEOJSON(ST_ENDPOINT(path)) AS end_point
FROM routes
WHERE name = 'Delivery Route A';

-- Distance from route end to warehouse
SELECT
    r.name,
    ST_DISTANCE(ST_ENDPOINT(r.path), w.location) AS distance_to_warehouse
FROM routes r, warehouses w;
```

---

### ST_POINTN

Return the Nth point of a LineString (1-based index).

#### Syntax

```sql
ST_POINTN(linestring, n) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| linestring | GEOMETRY | LineString geometry |
| n | INTEGER | Point index (1-based) |

#### Return Value

GEOMETRY - Nth point of the LineString.

#### Examples

```sql
-- Get the second waypoint of a route
SELECT ST_ASGEOJSON(ST_POINTN(path, 2)) AS second_stop
FROM routes
WHERE name = 'Delivery Route A';

-- Coordinates of third point
SELECT
    ST_X(ST_POINTN(path, 3)) AS lon,
    ST_Y(ST_POINTN(path, 3)) AS lat
FROM routes;
```

---

### ST_LINEINTERPOLATEPOINT

Return a point at a given fraction along a LineString.

#### Syntax

```sql
ST_LINEINTERPOLATEPOINT(linestring, fraction) → GEOMETRY
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| linestring | GEOMETRY | LineString geometry |
| fraction | DOUBLE | Position along line (0.0 = start, 1.0 = end) |

#### Return Value

GEOMETRY - Point at the specified fraction along the line.

#### Examples

```sql
-- Midpoint of a route
SELECT ST_ASGEOJSON(ST_LINEINTERPOLATEPOINT(path, 0.5)) AS midpoint
FROM routes
WHERE name = 'Delivery Route A';

-- Estimated driver position at 25% completion
SELECT ST_LINEINTERPOLATEPOINT(path, 0.25) AS estimated_position
FROM routes
WHERE id = '550e8400-e29b-41d4-a716-446655440000';
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

### Delivery Zone Buffer

```sql
-- Create a 2km delivery zone around a store and find customers within it
SELECT
    c.name,
    c.address,
    ST_DISTANCE(c.location, s.location) AS distance_meters
FROM customers c, stores s
WHERE s.name = 'Main Street Store'
  AND ST_CONTAINS(ST_BUFFER(s.location, 2000), c.location)
ORDER BY distance_meters;
```

### Area Calculation

```sql
-- Compare service region sizes
SELECT
    name,
    ST_AREA(boundary) AS area_sq_meters,
    ROUND(ST_AREA(boundary) / 1000000.0, 2) AS area_sq_km
FROM service_regions
ORDER BY area_sq_meters DESC;
```

### Route Length

```sql
-- Calculate delivery route lengths
SELECT
    name,
    ROUND(ST_LENGTH(path), 0) AS length_meters,
    ROUND(ST_LENGTH(path) / 1000.0, 2) AS length_km
FROM routes
ORDER BY length_meters DESC;
```

### Zone Overlap Analysis

```sql
-- Find overlapping delivery areas and calculate shared coverage
SELECT
    z1.name AS zone_a,
    z2.name AS zone_b,
    ROUND(ST_AREA(ST_INTERSECTION(z1.boundary, z2.boundary)) / 1000000.0, 2) AS overlap_sq_km,
    ROUND(ST_AREA(ST_INTERSECTION(z1.boundary, z2.boundary))
        / ST_AREA(z1.boundary) * 100, 1) AS pct_of_zone_a
FROM delivery_zones z1
JOIN delivery_zones z2 ON ST_INTERSECTS(z1.boundary, z2.boundary)
WHERE z1.id < z2.id
ORDER BY overlap_sq_km DESC;
```

---

## Notes

- All distance calculations use meters
- 49 PostGIS-compatible geospatial functions available
- Coordinates are in WGS84 (longitude, latitude)
- Longitude is X coordinate, Latitude is Y coordinate
- Functions use spheroid calculations for accuracy
- Spatial indexes improve query performance
- GeoJSON format: `[longitude, latitude]` (X, Y order)
- Compatible with PostGIS conventions
- Supports Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, and GeometryCollection types
- Set operations (ST_UNION, ST_INTERSECTION, ST_DIFFERENCE, ST_SYMDIFFERENCE) work on Polygon types
