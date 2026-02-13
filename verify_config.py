import sys
import os

sys.path.append(os.getcwd())

from backend.config_manager import ConfigManager

try:
    # Test Validate Config
    valid, msg = ConfigManager.validate_config(
        "postgres",
        {
            "host": "localhost",
            "port": 5432,
            "database": "testdb",
            "username": "admin",
            "password": "pass",
        },
    )
    print(f"Validation Result: {valid}, {msg}")

    # Test URL Construction (Dry run update)
    params = {
        "host": "localhost",
        "port": 5432,
        "database": "testdb",
        "username": "admin",
        "password": "pass",
    }
    # Simulate update logic logic
    from urllib.parse import quote_plus

    url = f"postgresql://{params['username']}:{quote_plus(str(params['password']))}@{params['host']}:{params['port']}/{params['database']}"
    print(f"Constructed URL: {url}")

except Exception as e:
    print(f"Error: {e}")
