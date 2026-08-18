#!/bin/bash
# Distinguish "the POI is absent from OpenStreetMap" from "the search engine could not
# find it". Queries Overpass by name regex inside a city bbox. Keyless.
Q='[out:json][timeout:60];
(
 nwr["name"~"Imperial Craft",i](32.05,34.74,32.11,34.81);
 nwr["name"~"Xoho",i](32.05,34.74,32.11,34.81);
 nwr["name"~"אורנה",i](32.05,34.74,32.11,34.81);
 nwr["name"~"Orna",i](32.05,34.74,32.11,34.81);
 nwr["name"~"Levinsky 41",i](32.03,34.74,32.11,34.81);
 nwr["name"~"Dishoom",i](51.45,-0.25,51.58,0.02);
 nwr["name"~"Glitch",i](35.6,139.6,35.8,139.85);
 nwr["name"~"Fuglen",i](35.6,139.6,35.8,139.85);
);
out tags center;'
curl -s -m 90 -A "P-002-university-project/0.1 (liorj@arbitrip.com)" \
  --data-urlencode "data=$Q" https://overpass-api.de/api/interpreter
