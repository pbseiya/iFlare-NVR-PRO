-- Migration: Add status tracking to video_segments
-- Date: 2026-02-09
-- Purpose: Support M4V to H.264 conversion workflow with status tracking

-- Add status column to video_segments table
ALTER TABLE video_segments
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ready';

-- Create index for efficient status filtering
CREATE INDEX IF NOT EXISTS idx_video_segments_status ON video_segments (status);

-- Update existing records to 'ready' status
UPDATE video_segments SET status = 'ready' WHERE status IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN video_segments.status IS 'Video segment processing status: recording, processing, ready, failed';