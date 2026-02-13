import os
from .base import DatabaseInterface
from .postgres import PostgresDatabase

# from .sqlserver import SQLServerDatabase (Lazy import)
from backend.config_manager import ConfigManager


def get_database() -> DatabaseInterface:
    """
    Factory function to get the configured database instance.
    Reads configuration from ConfigManager (config.json) with fallback to env.
    """
    # Get configuration from ConfigManager
    db_config = ConfigManager.get_database_config()
    provider = db_config.get("provider", "postgres").lower()

    if provider == "postgres":
        postgres_config = db_config.get("postgres", {})

        # Use URL if available, otherwise construct from granular fields
        db_url = postgres_config.get("url")
        if not db_url:
            from urllib.parse import quote_plus

            host = postgres_config.get("host", "localhost")
            port = postgres_config.get("port", 5432)
            database = postgres_config.get("database", "yolov11_inference")
            username = postgres_config.get("username", "admin")
            password = postgres_config.get("password", "password")

            # Handle password masking if it comes from config
            if password == "***":
                # This shouldn't happen during runtime as load_config handles unmasking
                # but good to be safe or log a warning
                pass

            db_url = f"postgresql://{username}:{quote_plus(str(password))}@{host}:{port}/{database}"

        return PostgresDatabase(db_url)

    elif provider == "sqlserver":
        from .sqlserver import SQLServerDatabase

        sqlserver_config = db_config.get("sqlserver", {})
        server = sqlserver_config.get("server")
        database = sqlserver_config.get("database")
        username = sqlserver_config.get("username")
        password = sqlserver_config.get("password")
        driver = sqlserver_config.get("driver", "{ODBC Driver 18 for SQL Server}")

        if not all([server, database, username, password]):
            # If config.json is missing or incomplete, try env vars as fallback
            # This maintains backward compatibility if config.json is empty
            server = os.getenv("iFlare_NVR_SERVER")
            database = os.getenv("iFlare_NVR_DATABASE")
            username = os.getenv("iFlare_NVR_USER")
            password = os.getenv("iFlare_NVR_PASSWORD")

            if not all([server, database, username, password]):
                raise ValueError("Missing SQL Server credentials in config.json and .env")

        # TrustServerCertificate=yes is often needed for self-signed certs (common in dev/local)
        # LoginTimeout=30 avoids startup crashes if DB is slow to respond
        conn_str = f"DRIVER={driver};SERVER={server};DATABASE={database};UID={username};PWD={password};TrustServerCertificate=yes;LoginTimeout=30;"
        return SQLServerDatabase(conn_str)

    else:
        raise ValueError(f"Unsupported DB_PROVIDER: {provider}")
