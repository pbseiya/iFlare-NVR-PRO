#!/bin/bash

echo "🧹 Session Cleanup Script"
echo "=========================="
echo ""

# Database connection
DB_URL="postgresql://admin:password@localhost:5432/yolov11_inference"

# Function to list all sessions
list_sessions() {
    echo "📋 Current Sessions:"
    psql $DB_URL -c "SELECT id, LEFT(model_name, 30) as model, language, status, created_at FROM inference_sessions ORDER BY id DESC;"
}

# Function to delete specific session
delete_session() {
    local session_id=$1
    echo "🗑️  Deleting Session #$session_id..."
    psql $DB_URL -c "DELETE FROM inference_sessions WHERE id = $session_id;"
    echo "✅ Session #$session_id deleted"
}

# Function to delete all sessions except the latest N
keep_latest() {
    local keep_count=$1
    echo "🗑️  Keeping only the latest $keep_count sessions..."
    psql $DB_URL -c "
        DELETE FROM inference_sessions 
        WHERE id NOT IN (
            SELECT id FROM inference_sessions 
            ORDER BY created_at DESC 
            LIMIT $keep_count
        );
    "
    echo "✅ Cleanup complete"
}

# Function to delete sessions older than N days
delete_old() {
    local days=$1
    echo "🗑️  Deleting sessions older than $days days..."
    psql $DB_URL -c "
        DELETE FROM inference_sessions 
        WHERE created_at < NOW() - INTERVAL '$days days';
    "
    echo "✅ Old sessions deleted"
}

# Function to delete all stopped/failed sessions
delete_stopped() {
    echo "🗑️  Deleting all stopped/failed sessions..."
    psql $DB_URL -c "
        DELETE FROM inference_sessions 
        WHERE status IN ('stopped', 'failed', 'completed');
    "
    echo "✅ Stopped sessions deleted"
}

# Main menu
if [ $# -eq 0 ]; then
    echo "Usage:"
    echo "  ./cleanup_sessions.sh list                    # List all sessions"
    echo "  ./cleanup_sessions.sh delete <session_id>     # Delete specific session"
    echo "  ./cleanup_sessions.sh keep <N>                # Keep only latest N sessions"
    echo "  ./cleanup_sessions.sh old <days>              # Delete sessions older than N days"
    echo "  ./cleanup_sessions.sh stopped                 # Delete all stopped/failed sessions"
    echo ""
    list_sessions
    exit 0
fi

case "$1" in
    list)
        list_sessions
        ;;
    delete)
        if [ -z "$2" ]; then
            echo "❌ Error: Please specify session ID"
            echo "Usage: ./cleanup_sessions.sh delete <session_id>"
            exit 1
        fi
        delete_session $2
        ;;
    keep)
        if [ -z "$2" ]; then
            echo "❌ Error: Please specify number of sessions to keep"
            echo "Usage: ./cleanup_sessions.sh keep <N>"
            exit 1
        fi
        keep_latest $2
        ;;
    old)
        if [ -z "$2" ]; then
            echo "❌ Error: Please specify number of days"
            echo "Usage: ./cleanup_sessions.sh old <days>"
            exit 1
        fi
        delete_old $2
        ;;
    stopped)
        delete_stopped
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo "Run without arguments to see usage"
        exit 1
        ;;
esac
