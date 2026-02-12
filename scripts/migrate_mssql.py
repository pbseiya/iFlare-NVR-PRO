import pyodbc
import os

# Credentials from .env
SERVER = "10.31.1.18"
DATABASE = "FBSDemo"
USERNAME = "fbsDemo"
PASSWORD = "fbsDemo@Prd"
DRIVER = "{ODBC Driver 18 for SQL Server}"

conn_str = f"DRIVER={DRIVER};SERVER={SERVER};DATABASE={DATABASE};UID={USERNAME};PWD={PASSWORD};TrustServerCertificate=yes;"


def run_migration():
    print(f"Connecting to {SERVER} for migration...")
    try:
        conn = pyodbc.connect(conn_str, autocommit=True)
        cursor = conn.cursor()

        # Read schema file
        with open("database/schema_mssql.sql", "r") as f:
            sql_script = f.read()

        # Split by GO command (common in T-SQL scripts)
        commands = sql_script.split("GO")

        print("Executing schema migration...")
        for cmd in commands:
            if cmd.strip():
                try:
                    cursor.execute(cmd)
                except Exception as e:
                    print(f"⚠️ Error executing command: {e}")
                    print(f"Command partial: {cmd[:50]}...")

        print("✅ Schema migration completed.")
        conn.close()

    except Exception as e:
        print(f"❌ Migration Failed: {e}")


if __name__ == "__main__":
    run_migration()
