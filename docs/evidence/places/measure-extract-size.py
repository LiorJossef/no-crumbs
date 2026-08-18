import duckdb
c=duckdb.connect()
FOOD="('restaurant','cafe','bar','coffee_shop','pub','fast_food_restaurant','bakery','ice_cream_shop','wine_bar','beer_bar','cocktail_bar','nightclub','dessert_shop','tea_room','food_and_beverage_retail','bagel_shop','juice_bar','buffet_restaurant','kosher_restaurant','israeli_restaurant','ramen_restaurant','sushi_restaurant','izakaya')"
for t in ("tlv","tyo","ldn"):
    c.execute(f"CREATE TABLE {t} AS SELECT * FROM read_parquet('ov_{t}.parquet')")
    tot=c.sql(f"select count(*) from {t}").fetchone()[0]
    fd=c.sql(f"""select count(*) from {t} where cat is not null and (cat in {FOOD}
        or cat like '%restaurant%' or cat like '%cafe%' or cat like '%bar%' or cat like '%coffee%'
        or cat like '%bakery%' or cat like '%pub%' or cat like '%food%' or cat like '%dessert%'
        or cat like '%ice_cream%' or cat like '%tea%' or cat like '%juice%' or cat like '%nightclub%'
        or cat like '%brewery%' or cat like '%winery%' or cat like '%diner%' or cat like '%bistro%')""").fetchone()[0]
    c.execute(f"""COPY (SELECT id,name,cat,lat,lon,confidence FROM {t} WHERE cat is not null and (cat in {FOOD}
        or cat like '%restaurant%' or cat like '%cafe%' or cat like '%bar%' or cat like '%coffee%'
        or cat like '%bakery%' or cat like '%pub%' or cat like '%food%' or cat like '%dessert%'
        or cat like '%ice_cream%' or cat like '%tea%' or cat like '%juice%' or cat like '%nightclub%'
        or cat like '%brewery%' or cat like '%winery%' or cat like '%diner%' or cat like '%bistro%'))
        TO 'fd_{t}.csv'""")
    print(f"{t}: total={tot} food_drink={fd} ({100*fd/tot:.0f}%)")
