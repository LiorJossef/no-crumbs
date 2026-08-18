import duckdb,time
c=duckdb.connect(); c.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
SRC="s3://overturemaps-us-west-2/release/2026-07-22.0/theme=places/type=place/*.parquet"
t0=time.time()
c.execute(f"""CREATE TABLE tlv AS SELECT id, names.primary AS name, names.common AS alt,
   categories.primary AS cat, bbox.xmin AS lon, bbox.ymin AS lat, confidence, addresses
 FROM read_parquet('{SRC}')
 WHERE bbox.xmin BETWEEN 34.74 AND 34.86 AND bbox.ymin BETWEEN 32.03 AND 32.12""")
print(c.sql("select count(*) from tlv").fetchone(), round(time.time()-t0,1))
c.execute("COPY tlv TO 'ov_tlv.parquet'")
import duckdb, time
c = duckdb.connect()
c.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
SRC="s3://overturemaps-us-west-2/release/2026-07-22.0/theme=places/type=place/*.parquet"
for name,(x0,x1,y0,y1) in {"tyo":(139.60,139.90,35.58,35.80),"ldn":(-0.30,0.05,51.42,51.60)}.items():
    t0=time.time()
    c.execute(f"""CREATE TABLE {name} AS SELECT id, names.primary AS name,
       names.common AS alt,
       categories.primary AS cat, bbox.xmin AS lon, bbox.ymin AS lat, confidence, addresses
     FROM read_parquet('{SRC}')
     WHERE bbox.xmin BETWEEN {x0} AND {x1} AND bbox.ymin BETWEEN {y0} AND {y1}""")
    print(name, c.sql(f"select count(*) from {name}").fetchone(), round(time.time()-t0,1),"s", flush=True)
    c.execute(f"COPY {name} TO 'ov_{name}.parquet'")
