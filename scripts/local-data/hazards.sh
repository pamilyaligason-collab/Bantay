#!/usr/bin/env bash
# Build one hazard pack (PMTiles) from UP NOAH's per-province shapefiles (ODbL; docs/local-data/HAZARDS.md). Linux or WSL, needs gdal-bin,
# python3-gdal and tippecanoe.
#   scripts/local-data/hazards.sh <psgc_code> <NOAH province file prefix> [extract dir] [out dir]
#   e.g. scripts/local-data/hazards.sh 0701200000 Bohol
# Layers: flood (Flood_100year, field Var), landslide (LandslideHazards, field LH), surge (StormSurge_SSA4, field HAZ); each feature keeps
# one property, level 1/2/3 = low/medium/high (NOAH metadata_*.txt). A missing layer (inland province: no storm surge file) is skipped.
# The pack is checked against the unsimplified source by hazards_check.py before it is copied out; a failed check publishes nothing and exits 1.
set -euo pipefail
code=$1 prefix=$2 src=${3:-data/noah/extract} out=${4:-data/noah/packs}
export MAXZOOM=${MAXZOOM:-12}
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$out/$code"

layers=()
for spec in flood:Flood_100year:Var landslide:LandslideHazards:LH surge:StormSurge_SSA4:HAZ; do
  IFS=: read -r name file field <<<"$spec"
  shp="$src/${prefix}_${file}.shp"
  [ -f "$shp" ] || { echo "skip $name: no $shp"; continue; }
  # No simplification here: NOAH's cells are 10 m, so any pre-simplify of that size deletes whole cells (Opus review 3). -makevalid
  # repairs self-intersections the source sometimes has. tippecanoe simplifies to its own tile grid (~2.4 m at z12).
  ogr2ogr -f GeoJSONSeq "$work/$name.geojsonl" "$shp" -makevalid -explodecollections \
    -dialect SQLite -sql "SELECT CAST($field AS INTEGER) AS level, geometry FROM \"${prefix}_${file}\" WHERE CAST($field AS INTEGER) BETWEEN 1 AND 3"
  layers+=(-L "$name:$work/$name.geojsonl")
done
[ ${#layers[@]} -gt 0 ] || { echo "no layers for $prefix"; exit 1; }

# No feature dropping at the lookup zoom (a dropped polygon would read as "little to none"): no feature or tile size limits, and tiny
# polygons kept at max zoom. Lower zooms are only drawn, so tippecanoe may merge tiny polygons there (most of the file size otherwise).
tippecanoe -q -o "$work/hazards.pmtiles" -Z8 -z"$MAXZOOM" --no-feature-limit --no-tile-size-limit --no-tiny-polygon-reduction-at-maximum-zoom \
  --detect-shared-borders --attribution "Hazard data: UP NOAH Center (Project NOAH), ODbL 1.0" "${layers[@]}"

echo "$code $prefix built $(stat -c %s "$work/hazards.pmtiles") bytes; checking"
# Check before the pack reaches the publish folder, so a killed or failed run leaves nothing unchecked there.
python3 "$(dirname "$0")/hazards_check.py" "$work/hazards.pmtiles" "$prefix" "$src" || { echo "check failed: pack not published"; exit 1; }
sha=$(sha256sum "$work/hazards.pmtiles" | cut -d' ' -f1)
pack="$out/$code/hazards-$sha.pmtiles"
cp "$work/hazards.pmtiles" "$pack"
echo "$code $prefix $(basename "$pack") $(stat -c %s "$pack") bytes"
