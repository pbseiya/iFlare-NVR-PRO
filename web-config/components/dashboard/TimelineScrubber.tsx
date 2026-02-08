'use client';

import { useRef, useEffect, useState } from 'react';
import { Detection, SessionInfo } from '@/lib/api';

interface TimelineScrubberProps {
    startTime: Date;
    endTime: Date;
    currentTime: Date;
    events: Detection[];
    sessions?: SessionInfo[];
    segmentsBySessionId?: Record<number, any[]>;
    selectedCameras?: string[]; // New prop for multi-lane rendering
    onSeek: (time: Date) => void;
    height?: number;
    className?: string;
}

export default function TimelineScrubber({
    startTime,
    endTime,
    currentTime,
    events,
    sessions = [],
    segmentsBySessionId = {},
    selectedCameras = [],
    onSeek,
    height = 60,
    className = ''
}: TimelineScrubberProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Timeline range (Visible Window)
    const viewStart = startTime.getTime();
    const viewEnd = endTime.getTime();

    const draw = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize canvas to match container
        const { clientWidth, clientHeight } = container;
        canvas.width = clientWidth;
        canvas.height = clientHeight;

        // Clear canvas
        ctx.fillStyle = '#020617'; // bg-gray-950 (approx)
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const duration = viewEnd - viewStart;
        if (duration <= 0) return;

        const pixelsPerMs = canvas.width / duration;

        // --- 1. Draw Global Grid (Time Markers) ---
        ctx.strokeStyle = '#1F2937'; // gray-800
        ctx.fillStyle = '#6B7280'; // gray-500
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const updateGrid = () => {
            const targetPx = 100;
            const msPerTick = targetPx / pixelsPerMs;
            const intervals = [
                1000, 10000, 60000, 300000, 600000, 3600000,
                10800000, 21600000, 43200000, 86400000, 604800000
            ];
            const interval = intervals.find(i => i >= msPerTick) || 86400000;
            const firstTick = Math.ceil(viewStart / interval) * interval;

            for (let t = firstTick; t <= viewEnd; t += interval) {
                const x = (t - viewStart) * pixelsPerMs;

                // Grid line
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();

                // Label
                const date = new Date(t);
                let label = '';
                if (interval < 60000) label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                else if (interval < 86400000) label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                else label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

                ctx.fillText(label, x, canvas.height - 14); // Draw at bottom
            }
        };
        updateGrid();

        // --- 2. Calculate Lanes ---
        // If no cameras selected, treat as 1 lane.
        const lanes = selectedCameras.length > 0 ? selectedCameras : ['All'];
        const laneHeight = (height - 20) / lanes.length; // Reserve 20px at bottom for timeline labels

        // Helper to get lane index
        const getLaneIndex = (sessionOrEventName: string) => {
            if (lanes.length === 1 && lanes[0] === 'All') return 0;
            return lanes.indexOf(sessionOrEventName);
        };

        // --- 3. Draw Sessions (Gap-Aware) per Lane ---
        sessions.forEach(session => {
            const camName = session.name || session.source_path;
            const laneIdx = getLaneIndex(camName);
            if (laneIdx === -1) return; // Not in selected cameras

            const sTime = new Date(session.created_at).getTime();
            const eTime = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
            const laneY = laneIdx * laneHeight;

            // 1. Draw Faint Background for Session Duration (System Active Scope)
            if (eTime >= viewStart && sTime <= viewEnd) {
                const startX = Math.max(0, (sTime - viewStart) * pixelsPerMs);
                const endX = Math.min(canvas.width, (eTime - viewStart) * pixelsPerMs);
                const w = endX - startX;

                if (w > 0) {
                    ctx.fillStyle = '#1e293b'; // slate-800 (very dark blue-gray)
                    ctx.fillRect(startX, laneY + 2, w, laneHeight - 4);
                }
            }

            // 2. Draw Actual Video Segments (Bright Blue)
            const segments = segmentsBySessionId[session.id] || [];
            if (segments.length > 0) {
                ctx.fillStyle = '#3B82F6'; // Blue-500
                segments.forEach(seg => {
                    const segStart = new Date(seg.start_time).getTime();
                    // Use duration if available, else approximate or skip
                    // segments usually have duration in seconds
                    const durMs = (seg.duration_seconds || 0) * 1000;
                    if (durMs <= 0) return;

                    const segEnd = segStart + durMs;

                    if (segEnd < viewStart || segStart > viewEnd) return;

                    const startX = (segStart - viewStart) * pixelsPerMs;
                    const endX = (segEnd - viewStart) * pixelsPerMs; // allow overshoot, canvas clips

                    // Draw distinct block
                    ctx.fillRect(Math.max(0, startX), laneY + 2, Math.max(1, endX - startX), laneHeight - 4);
                });
            } else {
                // FALLBACK: If no segments loaded yet (or legacy session), draw solid blue bar for whole session
                // This preserves behavior for sessions before we had segments or if fetch fails
                // But specifically for our fixed session 101, it has segments, so it should render fine.
                // If it has segments in DB but we failed to fetch, it will look like "System Active" but no video.
                // Let's keep logic simple: if segments array is explicit empty but session is legacy, we might want to default.
                // But for now, "Gap-Aware" means if we don't see segments, we don't draw video.
                // EXCEPT if session.video_output_path is set (Legacy Mode) -> Single file
                if (session.video_output_path) {
                    const startX = Math.max(0, (sTime - viewStart) * pixelsPerMs);
                    const endX = Math.min(canvas.width, (eTime - viewStart) * pixelsPerMs);
                    const w = endX - startX;
                    if (w > 0) {
                        ctx.fillStyle = '#3B82F6';
                        ctx.fillRect(startX, laneY + 2, w, laneHeight - 4);
                    }
                }
            }
        });

        // --- 4. Draw Events (Detections) per Lane ---
        const getPriority = (cls: string = '') => {
            const c = cls.toLowerCase();
            // Higher number = Higher Priority (Drawn last, on top)
            if (c.includes('fire_smoke') || c.includes('firesmoke')) return 4;
            if (c.includes('smoke')) return 3;
            if (c.includes('fire')) return 2;
            if (c.includes('steam')) return 1;
            return 0;
        };

        // Sort ascending, so high priority is drawn last (on top)
        const sortedEvents = [...events].sort((a, b) => getPriority(a.class_name) - getPriority(b.class_name));

        sortedEvents.forEach(event => {
            if (!event.timestamp) return;
            const t = new Date(event.timestamp).getTime();
            if (t < viewStart || t > viewEnd) return;

            // Find which session this event belongs to to identify camera
            const session = sessions.find(s => s.id === event.session_id);
            // If session not found in visible list, try legacy matching or skip?
            // If we have 'All' lane, we might want to plot it anyway if we can guess the camera?
            // But strict strict session matching is safer.
            if (!session) return;

            const camName = session.name || session.source_path;
            const laneIdx = getLaneIndex(camName);
            if (laneIdx === -1) return;

            const x = (t - viewStart) * pixelsPerMs;
            const y = laneIdx * laneHeight;

            // Color Coding
            const cls = (event.class_name || '').toLowerCase();
            const priority = getPriority(cls);

            let color = '#3B82F6'; // Default Blue
            if (priority === 4) color = '#EF4444'; // FireSmoke (Red)
            else if (priority === 3) color = '#A855F7'; // Smoke (Purple)
            else if (priority === 2) color = '#EAB308'; // Fire (Yellow)
            else if (priority === 1) color = '#22C55E'; // Steam (Green)

            ctx.fillStyle = color;

            // Draw wider ticks for higher priority for visibility?
            // Standard width 2px, maybe 3px?
            const width = 3;

            ctx.globalAlpha = 1.0; // Solid color
            ctx.fillRect(x - (width / 2), y + 2, width, laneHeight - 4);
        });

        // --- 5. Draw Lane Separators & Labels ---
        if (lanes.length > 1) {
            ctx.strokeStyle = '#374151'; // gray-700
            ctx.fillStyle = '#9CA3AF'; // gray-400
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = '10px monospace';

            lanes.forEach((lane, idx) => {
                const y = idx * laneHeight;

                // Separator line (bottom of lane)
                if (idx < lanes.length - 1) {
                    ctx.beginPath();
                    ctx.moveTo(0, y + laneHeight);
                    ctx.lineTo(canvas.width, y + laneHeight);
                    ctx.stroke();
                }

                // Camera Label (Semi-transparent overlay)
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, y, 100, 16);
                ctx.fillStyle = '#E5E7EB'; // gray-200
                ctx.fillText(lane, 4, y + 8);
            });
        }

        // --- 6. Draw Playhead ---
        const currentT = currentTime.getTime();
        if (currentT >= viewStart && currentT <= viewEnd) {
            const x = (currentT - viewStart) * pixelsPerMs;

            ctx.strokeStyle = '#EF4444'; // Red playhead
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();

            // Handle head
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.moveTo(x - 6, 0);
            ctx.lineTo(x + 6, 0);
            ctx.lineTo(x, 8);
            ctx.fill();
        }
    };

    useEffect(() => {
        draw();
        window.addEventListener('resize', draw);
        return () => window.removeEventListener('resize', draw);
    }, [startTime, endTime, currentTime, events, sessions, segmentsBySessionId, selectedCameras, viewStart, viewEnd]);

    const handleMouseEvent = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const duration = viewEnd - viewStart;
        const time = new Date(viewStart + (x / rect.width) * duration);

        if (e.type === 'mousedown') {
            setIsDragging(true);
            onSeek(time);
        } else if (e.type === 'mousemove' && isDragging) {
            onSeek(time);
        } else if (e.type === 'mouseup' || e.type === 'mouseleave') {
            setIsDragging(false);
        }
    };

    return (
        <div
            ref={containerRef}
            className={`relative w-full overflow-hidden select-none cursor-pointer bg-gray-950 border-t border-gray-800 ${className}`}
            style={{ height }}
            onMouseDown={handleMouseEvent}
            onMouseMove={handleMouseEvent}
            onMouseUp={handleMouseEvent}
            onMouseLeave={handleMouseEvent}
        >
            <canvas ref={canvasRef} className="block" />
        </div>
    );
}
