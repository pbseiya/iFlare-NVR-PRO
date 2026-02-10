import subprocess
import time

DB_USER = "admin"
DB_NAME = "yolov11_inference"
CONTAINER_NAME = "shared_postgres"


def run_psql(sql):
    # Use -dd to avoid "password authentication failed" if .pgpass is missing,
    # but for docker exec we usually are root or trusted.
    # We use -U admin which should be the owner.
    cmd = ["docker", "exec", "-i", CONTAINER_NAME, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql]
    print(f"Executing: {' '.join(cmd)} with SQL: {sql.strip()}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error executing SQL.")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        return False
    print("Success.")
    return True


def migrate():
    print("Migrating database...")

    # Create table
    create_table_sql = """
        CREATE TABLE IF NOT EXISTS app_settings (
            key VARCHAR(255) PRIMARY KEY,
            value JSONB,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """
    if run_psql(create_table_sql):
        print("Created table app_settings.")

    # Insert default
    insert_default_sql = """
        INSERT INTO app_settings (key, value, description)
        VALUES ('auto_resume', 'false'::jsonb, 'Automatically resume running sessions on server startup')
        ON CONFLICT (key) DO NOTHING;
    """
    if run_psql(insert_default_sql):
        print("Inserted default auto_resume setting.")


if __name__ == "__main__":
    migrate()
