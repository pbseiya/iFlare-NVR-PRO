# Database Write Logic Documentation

This document outlines the conditions and triggers for writing data to the database in the iFlare-NVR-PRO system.

## Database Write Triggers

# DATABASE WRITE LOGIC

The inference engine utilizes an asynchronous batch writing system to optimize database performance and ensure data durability.

## Core Components

| Component | Description |
| :--- | :--- |
| **AsyncDatabaseWriter** | Manages memory buffers, Write-Ahead Log (WAL), and batch flushing. |
| **Memory Buffer** | Temporarily stores `detections` and `metrics` to avoid per-frame DB writes. |
| **WAL (Write-Ahead Log)** | Filesystem persistence (`logs/wal_current.log`) for pre-commit data safety. |

## Write Conditions

1.  **Memory Buffer**: Data is enqueued during the inference loop.
2.  **WAL Write**: Data is immediately appended to the WAL file asynchronously.
3.  **DB Flush**: Memory buffer is flushed to the database when:
    -   Buffer size reaches **100 items**.
    -   **1 second** has elapsed since the last flush.
4.  **Cleanup**: WAL is cleared only after a successful database commit.

## Recovery Mechanism
On system startup, the `AsyncDatabaseWriter` checks for `logs/wal_current.log`. If data exists, it is re-enqueued and flushed to the database before processing new inference data.

## Multi-Vendor Support
The batch writing logic is vendor-agnostic. The `DatabaseFactory` correctly initializes either `PostgresDatabase` or `SQLServerDatabase` based on `config.json`.

-   **PostgreSQL**: Verified successful write of 230+ records in a single test session using `psql`.
-   **SQL Server**: Verified persistence in `FBSDemo` database (10.31.1.18) using `sqlcmd`.

> [!IMPORTANT]
> Both providers utilize the same `AsyncDatabaseWriter` and WAL mechanism, ensuring consistent reliability and zero data loss across different environments.
