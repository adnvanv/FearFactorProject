"""Create a small SQLite database from the MILDEC CSVs for trying the app.

    python app/demo/make_demo_db.py
    -> app/demo/mildec_demo.db with tables mildec_short and mildec_long

Connection URL for the app:  sqlite:///app/demo/mildec_demo.db
"""

import os
import sqlite3

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DB = os.path.join(HERE, "mildec_demo.db")

if os.path.exists(DB):
    os.remove(DB)
with sqlite3.connect(DB) as conn:
    for table, name in [("mildec_short", "MILDEC_short_out.csv"), ("mildec_long", "MILDEC_long_out.csv")]:
        df = pd.read_csv(os.path.join(ROOT, "data", name))
        df.to_sql(table, conn, index=False)
        print(f"{table}: {len(df)} rows")
print(f"Created {DB}")
print(f"Connection URL: sqlite:///{DB.replace(os.sep, '/')}")
