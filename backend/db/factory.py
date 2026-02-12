import os
from .base import DatabaseInterface
from .postgres import PostgresDatabase

# from .sqlserver import SQLServerDatabase (Lazy import)


def get_database() -> DatabaseInterface:
    """
    Factory function to get the configured database instance.
    Reads DB_PROVIDER from environment variables.
    """
    provider = os.getenv("DB_PROVIDER", "postgres").lower()

    if provider == "postgres":
        db_url = os.getenv(
            "DATABASE_URL", "postgresql://admin:password@localhost:5432/yolov11_inference"
        )
        return PostgresDatabase(db_url)

    elif provider == "sqlserver":
        from .sqlserver import SQLServerDatabase

        # Build connection string for SQL Server
        server = os.getenv("iFlare_NVR_SERVER")
        database = os.getenv("iFlare_NVR_DATABASE")
        username = os.getenv("iFlare_NVR_USER")
        password = os.getenv("iFlare_NVR_PASSWORD")
        driver = os.getenv("DB_DRIVER", "{ODBC Driver 18 for SQL Server}")

        if not all([server, database, username, password]):
            raise ValueError("Missing SQL Server credentials in .env")

        # TrustServerCertificate=yes is often needed for self-signed certs (common in dev/local)
        conn_str = f"DRIVER={driver};SERVER={server};DATABASE={database};UID={username};PWD={password};TrustServerCertificate=yes;"
        return SQLServerDatabase(conn_str)

    else:
        raise ValueError(f"Unsupported DB_PROVIDER: {provider}")
