import duckdb
c=duckdb.connect(); c.execute("CREATE TABLE tlv AS SELECT * FROM read_parquet('ov_tlv.parquet')")
for pat in ['%Levinsky%','%Anita%','%Orna%','%Sabich%','%Oved%','%עובד%','%קוסם%']:
    print(pat, c.execute("SELECT name,cat,lat,lon FROM tlv WHERE name ILIKE ? LIMIT 6",[pat]).fetchall())
print("hebrew primary names in TLV extract:", c.sql("SELECT count(*) FROM tlv WHERE regexp_matches(name,'[֐-׿]')").fetchone())
print("any hebrew in alt map:", c.sql("SELECT count(*) FROM tlv WHERE len(list_filter(coalesce(map_values(alt),[]), v -> regexp_matches(v,'[֐-׿]')))>0").fetchone())
print("total", c.sql("select count(*) from tlv").fetchone())
c.execute("CREATE TABLE tyo AS SELECT * FROM read_parquet('ov_tyo.parquet')")
print("japanese primary in TYO:", c.sql("SELECT count(*) FROM tyo WHERE regexp_matches(name,'[぀-ヿ一-鿿]')").fetchone(), "total", c.sql("select count(*) from tyo").fetchone())
print("alt-name maps present TLV/TYO:", c.sql("SELECT count(*) FROM tlv WHERE alt IS NOT NULL").fetchone(), c.sql("SELECT count(*) FROM tyo WHERE alt IS NOT NULL").fetchone())
# category vocabulary sample
print(c.sql("SELECT cat, count(*) n FROM tlv GROUP BY 1 ORDER BY n DESC LIMIT 12").fetchall())
