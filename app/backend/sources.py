"""Load rows from SQL databases or uploaded CSV files.

SQL connections use SQLAlchemy URLs, e.g.
    sqlite:///C:/path/to/file.db
    postgresql+psycopg://user:password@host:5432/dbname
    mysql+pymysql://user:password@host/dbname
    mssql+pyodbc://user:password@dsn

Only a single SELECT (or WITH ... SELECT) statement is accepted, and it runs
inside a transaction that is always rolled back, so loading data cannot
change the database.
"""

import io
import re

import pandas as pd
from sqlalchemy import create_engine, inspect, text

MAX_ROWS = 20000
_COMMENTS = re.compile(r"(--[^\n]*)|(/\*.*?\*/)", re.S)


class SourceError(ValueError):
    pass


def check_select(query: str) -> str:
    stripped = _COMMENTS.sub(" ", query or "").strip().rstrip(";").strip()
    if not stripped:
        raise SourceError("Enter a SQL query.")
    if ";" in stripped:
        raise SourceError("Only one statement is allowed.")
    if not re.match(r"^(select|with)\b", stripped, re.I):
        raise SourceError("Only SELECT queries are allowed when loading data.")
    return stripped


def _engine(url: str):
    if not url or "://" not in url:
        raise SourceError("Enter a SQLAlchemy connection URL, e.g. sqlite:///path/to/file.db")
    try:
        return create_engine(url)
    except Exception as e:  # bad dialect / missing driver
        raise SourceError(f"Could not create a connection: {e}") from None


def list_tables(url: str):
    engine = _engine(url)
    try:
        insp = inspect(engine)
        return [
            {"name": t, "columns": [c["name"] for c in insp.get_columns(t)]}
            for t in insp.get_table_names()
        ]
    except Exception as e:
        raise SourceError(f"Could not connect: {e}") from None
    finally:
        engine.dispose()


def run_query(url: str, query: str, limit: int = MAX_ROWS) -> pd.DataFrame:
    sql = check_select(query)
    engine = _engine(url)
    try:
        with engine.connect() as conn:
            trans = conn.begin()
            try:
                result = conn.execute(text(sql))
                rows = result.fetchmany(limit)
                df = pd.DataFrame(rows, columns=list(result.keys()))
            finally:
                trans.rollback()
        return df
    except SourceError:
        raise
    except Exception as e:
        raise SourceError(f"Query failed: {e}") from None
    finally:
        engine.dispose()


def write_table(url: str, table: str, df: pd.DataFrame):
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", table or ""):
        raise SourceError("Table name must be letters, numbers and underscores.")
    engine = _engine(url)
    try:
        df.to_sql(table, engine, if_exists="fail", index=False)
    except ValueError as e:
        raise SourceError(f"Table '{table}' already exists. Pick a new name.") from None
    except Exception as e:
        raise SourceError(f"Could not write results: {e}") from None
    finally:
        engine.dispose()


def read_csv_bytes(data: bytes) -> pd.DataFrame:
    try:
        return pd.read_csv(io.BytesIO(data)).head(MAX_ROWS)
    except Exception as e:
        raise SourceError(f"Could not read CSV: {e}") from None
