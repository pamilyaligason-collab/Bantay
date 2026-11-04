#!/usr/bin/env python3
"""Check a NOAH hazard pack against its source shapefiles, the way the app will read it (docs/local-data/HAZARDS.md section 4).

    python3 scripts/local-data/hazards_check.py <pack.pmtiles> <NOAH prefix> [extract dir] [samples per kind]

For each layer: points from (a) parts picked uniformly by index, which are mostly single 10 m cells, and (b) area-weighted points inside
parts, all from the UNSIMPLIFIED source, with a fixed seed. Expected = the highest source level containing the point (levels overlap).
Got = app-like lookup: tippecanoe-decode the max-zoom tile, even-odd ray casting over every ring, highest level wins.
An under-report passes only when the point is within EDGE_M of a source boundary (tile grid rounding); anything else fails.
Exits 1 on any failure or if nothing was sampled. Needs python3-gdal and tippecanoe-decode (Linux or WSL).
"""
import json, math, os, random, shutil, subprocess, sys, tempfile
from osgeo import ogr

ogr.UseExceptions()

EDGE_M = 2.5  # about one z12 tile unit (~2.35 m): a 10 m cell's centre is 5 m from every edge, so a lost cell cannot be excused
SLIVER_M = 1.25  # half a z12 tile unit: a part with no interior after this inward buffer (a clipping strip under ~2.5 m wide) is
                 # not sampled or expected; tippecanoe collapses it anyway, and a real 10 m cell always survives (Opus review 5)
LAYERS = [('flood', 'Flood_100year', 'Var'), ('landslide', 'LandslideHazards', 'LH'), ('surge', 'StormSurge_SSA4', 'HAZ')]


def tile_of(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


class Pack:
    def __init__(self, path):
        self.path = path
        self.maxzoom = int(os.environ.get('MAXZOOM', '12'))  # must match the build (hazards.sh MAXZOOM)
        self.cache = {}

    def features(self, layer, z, x, y):
        key = (layer, z, x, y)
        if key not in self.cache:
            out = subprocess.run(['tippecanoe-decode', '-l', layer, self.path, str(z), str(x), str(y)], capture_output=True, text=True).stdout
            feats = []
            if out.strip():
                for fc in json.loads(out).get('features', []):
                    feats += fc['features']
            self.cache[key] = feats
        return self.cache[key]

    def level_at(self, layer, lat, lon):
        x, y = tile_of(lat, lon, self.maxzoom)
        best = 0
        for f in self.features(layer, self.maxzoom, x, y):
            g = f['geometry']
            polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
            inside = False
            for p in polys:
                for ring in p:
                    for i in range(len(ring)):
                        x1, y1 = ring[i]
                        x2, y2 = ring[i - 1]
                        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                            inside = not inside
            if inside:
                best = max(best, int(f['properties']['level']))
        return best


def metres(deg, lat):
    return deg * 111320 * max(math.cos(math.radians(lat)), 0.2)


def main():
    pack_path, prefix = sys.argv[1], sys.argv[2]
    src = sys.argv[3] if len(sys.argv) > 3 else 'data/noah/extract'
    per_kind = int(sys.argv[4]) if len(sys.argv) > 4 else 150
    rng = random.Random(20261101)
    pack = Pack(pack_path)
    tmp = tempfile.mkdtemp()
    try:
        total, edge, bad, slivers = run(pack, prefix, src, per_kind, rng, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)  # the exploded GPKGs are ~280 MB per run
    print(f'check: {total} points, {total - edge - bad} exact, {edge} under-reports within {EDGE_M} m of an edge, {bad} real misses; '
          f'{slivers} sliver parts skipped')
    if total == 0:
        print('check sampled nothing')
        sys.exit(1)
    sys.exit(1 if bad else 0)


def run(pack, prefix, src, per_kind, rng, tmp):
    total = edge = bad = slivers = 0
    seen = {}  # fid -> is sliver, across draws and expected-level tests

    def sliver(fid, g):
        if fid not in seen:
            seen[fid] = g.Buffer(-SLIVER_M / 111320).IsEmpty()
        return seen[fid]

    for name, file, field in LAYERS:
        seen.clear()
        shp = f'{src}/{prefix}_{file}.shp'
        if not os.path.exists(shp):
            print(f'skip {name}: no source')
            continue
        # exploded copy with a spatial index, so "highest source level at a point" is a fast indexed query
        gpkg = f'{tmp}/{name}.gpkg'
        subprocess.run(['ogr2ogr', '-f', 'GPKG', gpkg, shp, '-explodecollections', '-nln', 'p', '-dialect', 'SQLite', '-sql',
                        f'SELECT CAST({field} AS INTEGER) AS level, geometry FROM "{prefix}_{file}"'], check=True)
        ds = ogr.Open(gpkg)  # keep the datasource alive: a layer from a collected datasource crashes GDAL's Python bindings
        lyr = ds.GetLayer('p')
        count = lyr.GetFeatureCount()
        areas = []
        for f in lyr:
            areas.append(f.GetGeometryRef().GetArea())
        lyr.ResetReading()
        cum, s = [], 0.0
        for a in areas:
            s += a
            cum.append(s)
        def area_pick():
            r = rng.random() * s
            lo, hi = 0, len(cum) - 1
            while lo < hi:
                mid = (lo + hi) // 2
                if cum[mid] < r:
                    lo = mid + 1
                else:
                    hi = mid
            return lo

        draws = [('cell', lambda: rng.randrange(count))] * per_kind + [('area', area_pick)] * per_kind
        for kind, draw in draws:
            for _ in range(1000):  # re-draw slivers; 1000 tries always finds a real part in NOAH's data
                idx = draw()
                feat = lyr.GetFeature(idx + 1)  # GPKG fids start at 1; keep the feature alive while its geometry is used
                if not sliver(idx + 1, feat.GetGeometryRef()):
                    break
            part = feat.GetGeometryRef().Clone()
            minx, maxx, miny, maxy = part.GetEnvelope()
            pt = None
            if kind == 'cell':
                c = part.Centroid()  # the cell centre; PointOnSurface can sit on the edge of an L-shaped part
                pt = c if part.Contains(c) else part.PointOnSurface()
            else:
                for _ in range(200):
                    c = ogr.Geometry(ogr.wkbPoint)
                    c.AddPoint_2D(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
                    if part.Contains(c):
                        pt = c
                        break
                pt = pt or part.PointOnSurface()
            lon, lat = pt.GetX(), pt.GetY()
            lyr.SetSpatialFilter(pt)
            want, near = 0, float('inf')
            for f in lyr:
                g = f.GetGeometryRef()
                if g.Contains(pt) and not sliver(f.GetFID(), g):
                    want = max(want, f.GetField('level'))
                near = min(near, g.Boundary().Distance(pt))
            lyr.SetSpatialFilter(None)
            got = pack.level_at(name, lat, lon)
            total += 1
            if got >= want:
                continue
            d = metres(near, lat)
            # Edge rounding only if the point is within EDGE_M of a source edge AND the pack has this level within EDGE_M.
            dlat = EDGE_M / 111320
            dlon = dlat / max(math.cos(math.radians(lat)), 0.2)
            nearby = max(pack.level_at(name, lat + a * dlat, lon + b * dlon) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b)
            if d <= EDGE_M and nearby >= want:
                edge += 1
                print(f'edge {name} {kind} want {want} got {got} at {lat:.7f},{lon:.7f}, {d:.2f} m from the edge')
            else:
                bad += 1
                print(f'MISS {name} {kind} want {want} got {got} at {lat:.7f},{lon:.7f}, {d:.1f} m from the edge')
        slivers += sum(seen.values())
        ds = None
    return total, edge, bad, slivers


if __name__ == '__main__':
    main()
