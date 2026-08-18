#!/bin/bash
# Second pass: match ANY name:* key (venues in Tel Aviv are often tagged with a Hebrew
# `name` and a Latin `name:en`, so a regex on `name` alone under-reports coverage).
Q='[out:json][timeout:90];
(
 nwr[~"^name"~"Imperial Craft",i](32.03,34.74,32.12,34.82);
 nwr[~"^name"~"Xoho",i](32.03,34.74,32.12,34.82);
 nwr[~"^name"~"אורנה ואלה",i](32.03,34.74,32.12,34.82);
 nwr[~"^name"~"Orna",i](32.03,34.74,32.12,34.82);
 nwr[~"^name"~"Levinsky 41",i](32.03,34.74,32.12,34.82);
 nwr[~"^name"~"עובד",i](32.05,34.79,32.10,34.83);
);
out tags center;'
curl -s -m 120 -A "P-002-university-project/0.1 (liorj@arbitrip.com)" \
  --data-urlencode "data=$Q" https://overpass-api.de/api/interpreter
