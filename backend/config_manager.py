"""
Configuration Manager for Database Settings
Handles reading, writing, and validating database configuration.
"""

import json
import os
from typing import Dict, Any, Optional
from pathlib import Path
from urllib.parse import urlparse, quote_plus


class ConfigManager:
    """Centralized configuration management with file I/O capabilities"""

    CONFIG_FILE = "config.json"
    ENV_FILE = ".env"

    _config: Optional[Dict[str, Any]] = None

    @classmethod
    def get_config_path(cls) -> Path:
        """Get absolute path to config.json"""
        return Path(__file__).parent.parent / cls.CONFIG_FILE

    @classmethod
    def load_config(cls) -> Dict[str, Any]:
        """
        Load configuration from config.json
        Falls back to .env if config.json doesn't exist
        """
        config_path = cls.get_config_path()

        if config_path.exists():
            with open(config_path, "r") as f:
                cls._config = json.load(f)
                return cls._config

        # Fallback: Create config from .env
        cls._config = cls._create_config_from_env()
        cls.save_config(cls._config)
        return cls._config

    @classmethod
    def _create_config_from_env(cls) -> Dict[str, Any]:
        """Create config.json structure from existing .env values"""
        provider = os.getenv("DB_PROVIDER", "postgres").lower()

        config = {"database": {"provider": provider}}

        if provider == "postgres":
            config["database"]["postgres"] = {
                "url": os.getenv(
                    "DATABASE_URL", "postgresql://admin:password@localhost:5432/yolov11_inference"
                )
            }

            # Parse URL to populate granular fields
            try:
                url = config["database"]["postgres"]["url"]
                parsed = urlparse(url)
                if parsed.scheme == "postgresql":
                    config["database"]["postgres"].update(
                        {
                            "host": parsed.hostname or "localhost",
                            "port": parsed.port or 5432,
                            "database": parsed.path.lstrip("/") or "yolov11_inference",
                            "username": parsed.username or "admin",
                            "password": parsed.password or "",
                        }
                    )
            except Exception:
                pass
        elif provider == "sqlserver":
            config["database"]["sqlserver"] = {
                "server": os.getenv("iFlare_NVR_SERVER", ""),
                "database": os.getenv("iFlare_NVR_DATABASE", ""),
                "username": os.getenv("iFlare_NVR_USER", ""),
                "password": os.getenv("iFlare_NVR_PASSWORD", ""),
                "driver": os.getenv("DB_DRIVER", "{ODBC Driver 18 for SQL Server}"),
            }

        config["watchdog"] = {
            "enabled": True,
            "timeout_seconds": 60,  # Force kill if no heartbeat for 60s
            "check_interval_seconds": 10,
        }

        return config

    @classmethod
    def save_config(cls, config: Dict[str, Any]) -> None:
        """Save configuration to config.json"""
        config_path = cls.get_config_path()

        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)

        cls._config = config

    @classmethod
    def get_database_config(cls) -> Dict[str, Any]:
        """Get current database configuration"""
        if cls._config is None:
            cls.load_config()

        return cls._config.get("database", {})

    @classmethod
    def get_watchdog_config(cls) -> Dict[str, Any]:
        """Get watchdog configuration"""
        if cls._config is None:
            cls.load_config()
        return cls._config.get(
            "watchdog",
            {"enabled": True, "timeout_seconds": 60, "check_interval_seconds": 10},
        )

    @classmethod
    def update_database_config(cls, provider: str, params: Dict[str, Any]) -> None:
        """
        Update database configuration

        Args:
            provider: Database provider ('postgres' or 'sqlserver')
            params: Provider-specific parameters
        """
        if cls._config is None:
            cls.load_config()

        if "database" not in cls._config:
            cls._config["database"] = {}

        cls._config["database"]["provider"] = provider

        # For Postgres, ensure URL is constructed if granular fields are present
        if provider == "postgres":
            if "url" not in params and all(
                k in params for k in ["host", "port", "database", "username", "password"]
            ):
                try:
                    params["url"] = (
                        f"postgresql://{params['username']}:{quote_plus(str(params['password']))}@{params['host']}:{params['port']}/{params['database']}"
                    )
                except Exception as e:
                    print(f"Error constructing PostgreSQL URL: {e}")

        cls._config["database"][provider] = params

        cls.save_config(cls._config)

    @classmethod
    def mask_sensitive_data(cls, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Mask sensitive data (passwords) in configuration
        Returns a copy with passwords replaced by '***'
        """
        import copy

        masked = copy.deepcopy(config)

        # Mask PostgreSQL password in URL
        if "postgres" in masked and "url" in masked["postgres"]:
            url = masked["postgres"]["url"]
            if ":" in url and "@" in url:
                # postgresql://user:password@host:port/db
                parts = url.split("@")
                if len(parts) == 2:
                    user_pass = parts[0].split("://")[1]
                    if ":" in user_pass:
                        user = user_pass.split(":")[0]
                        user = user_pass.split(":")[0]
                        masked["postgres"]["url"] = f"postgresql://{user}:***@{parts[1]}"

            # Mask granular password
            if "password" in masked["postgres"] and masked["postgres"]["password"]:
                masked["postgres"]["password"] = "***"

        # Mask SQL Server password
        if "sqlserver" in masked and "password" in masked["sqlserver"]:
            if masked["sqlserver"]["password"]:
                masked["sqlserver"]["password"] = "***"

        return masked

    @classmethod
    def preserve_masked_passwords(
        cls, new_config: Dict[str, Any], current_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Preserve original passwords when receiving masked values from UI
        If new_config contains '***', use the password from current_config
        """
        import copy

        result = copy.deepcopy(new_config)

        # Preserve PostgreSQL password
        if "postgres" in result and "url" in result["postgres"]:
            if ":***@" in result["postgres"]["url"]:
                # Extract current password
                if "postgres" in current_config and "url" in current_config["postgres"]:
                    current_url = current_config["postgres"]["url"]
                    if ":" in current_url and "@" in current_url:
                        current_pass = current_url.split("://")[1].split("@")[0].split(":")[1]
                        # Replace *** with actual password
                        result["postgres"]["url"] = result["postgres"]["url"].replace(
                            ":***@", f":{current_pass}@"
                        )

            # Preserve granular password
            if "password" in result["postgres"] and result["postgres"]["password"] == "***":
                if "postgres" in current_config and "password" in current_config["postgres"]:
                    result["postgres"]["password"] = current_config["postgres"]["password"]

        # Preserve SQL Server password
        if "sqlserver" in result and result["sqlserver"].get("password") == "***":
            if "sqlserver" in current_config and "password" in current_config["sqlserver"]:
                result["sqlserver"]["password"] = current_config["sqlserver"]["password"]

        return result

    @classmethod
    def validate_config(cls, provider: str, params: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate database configuration parameters

        Returns:
            (is_valid, error_message)
        """
        if provider == "postgres":
            has_url = "url" in params and params["url"]
            # Check for granular fields
            required = ["host", "port", "database", "username", "password"]
            has_granular = all(k in params and params[k] is not None for k in required)

            if not has_url and not has_granular:
                return False, "PostgreSQL configuration requires URL or Host/Port/DB/User/Pass"

            if has_url:
                url = params["url"]
                if not url.startswith("postgresql://"):
                    return False, "Invalid PostgreSQL URL format (must start with postgresql://)"

                if "@" not in url or "/" not in url:
                    return False, "Invalid PostgreSQL URL format (missing host or database)"

        elif provider == "sqlserver":
            required_fields = ["server", "database", "username", "password"]
            for field in required_fields:
                if field not in params or not params[field]:
                    return False, f"SQL Server {field} is required"

        else:
            return False, f"Unsupported database provider: {provider}"

        return True, None

    @classmethod
    async def test_connection(cls, provider: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Test database connection without saving configuration

        Returns:
            {
                "success": bool,
                "message": str,
                "latency_ms": float (optional)
            }
        """
        import time

        # Validate first
        is_valid, error = cls.validate_config(provider, params)
        if not is_valid:
            return {"success": False, "message": f"Validation failed: {error}"}

        try:
            start_time = time.time()

            if provider == "postgres":
                from .db.postgres import PostgresDatabase

                url = params.get("url")
                if not url and all(
                    k in params for k in ["host", "port", "database", "username", "password"]
                ):
                    url = f"postgresql://{params['username']}:{quote_plus(str(params['password']))}@{params['host']}:{params['port']}/{params['database']}"

                if not url:
                    return {
                        "success": False,
                        "message": "Missing PostgreSQL URL or connection details",
                    }

                db = PostgresDatabase(url)
                await db.connect()
                await db.health_check()
                await db.disconnect()

            elif provider == "sqlserver":
                from .db.sqlserver import SQLServerDatabase

                driver = params.get("driver", "{ODBC Driver 18 for SQL Server}")
                conn_str = f"DRIVER={driver};SERVER={params['server']};DATABASE={params['database']};UID={params['username']};PWD={params['password']};TrustServerCertificate=yes;LoginTimeout=30;"
                db = SQLServerDatabase(conn_str)
                await db.connect()
                await db.health_check()
                await db.disconnect()

            latency_ms = (time.time() - start_time) * 1000

            return {
                "success": True,
                "message": f"Successfully connected to {provider.upper()}",
                "latency_ms": round(latency_ms, 2),
            }

        except Exception as e:
            return {"success": False, "message": f"Connection failed: {str(e)}"}
