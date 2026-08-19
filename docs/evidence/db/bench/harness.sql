\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;

create or replace function bench(p_label text, p_sqls text[])
returns table(label text, iters int, p50_ms numeric, p95_ms numeric, max_ms numeric, avg_rows numeric)
language plpgsql as $$
declare
  t0 timestamptz; ms double precision[] := '{}'; rc bigint; tot bigint := 0; q text; n int;
begin
  -- one warmup pass
  foreach q in array p_sqls loop execute q; end loop;
  foreach q in array p_sqls loop
    t0 := clock_timestamp();
    execute q;
    get diagnostics rc = row_count;
    ms := ms || (extract(epoch from clock_timestamp() - t0) * 1000);
    tot := tot + rc;
  end loop;
  n := array_length(ms, 1);
  return query
    select p_label, n,
           round((percentile_cont(0.5)  within group (order by v))::numeric, 3),
           round((percentile_cont(0.95) within group (order by v))::numeric, 3),
           round(max(v)::numeric, 3),
           round(tot::numeric / n, 1)
      from unnest(ms) v;
end $$;
