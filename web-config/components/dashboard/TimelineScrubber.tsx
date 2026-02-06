'use client';

import { useRef, useEffect, useState } from 'react';
import { Detection, SessionInfo } from '@/lib/api';

interface TimelineScrubberProps {
    startTime: Date;
    endTime: Date;
    currentTime: Date;
    events: Detection[];
    sessions?: SessionInfo[];
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
        ctx.fillStyle = '#111827'; // bg-gray-900
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const duration = viewEnd - viewStart;
        if (duration <= 0) return;

        const pixelsPerMs = canvas.width / duration;

        // Draw time markers (grid)
        ctx.strokeStyle = '#374151'; // gray-700
        ctx.fillStyle = '#9CA3AF'; // gray-400
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';

        // Determine grid interval based on zoom
        const updateGrid = () => {
            // Simple adaptive grid: aim for ~100px per tick
            const targetPx = 100;
            const msPerTick = targetPx / pixelsPerMs;

            // Round to nice intervals (1s, 1m, 5m, 1h, 6h, 1d, 1w)
            const intervals = [
                1000, 10000, 60000, 300000, 600000, 3600000,
                10800000, 21600000, 43200000, 86400000, 604800000
            ];
            const interval = intervals.find(i => i >= msPerTick) || 86400000;

            // Align first tick to interval
            const firstTick = Math.ceil(viewStart / interval) * interval;

            for (let t = firstTick; t <= viewEnd; t += interval) {
                const x = (t - viewStart) * pixelsPerMs;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();

                const date = new Date(t);
                let label = '';
                if (interval < 60000) label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                else if (interval < 86400000) label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                else label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

                ctx.fillText(label, x, canvas.height - 5);
            }
        };
        updateGrid();

        // Draw Session Blocks (Green/Blue background where video exists)
        ctx.fillStyle = '#1e3a8a'; // blue-900 with opacity
        sessions.forEach(session => {
            const sTime = new Date(session.created_at).getTime();
            const eTime = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();

            // Skip if out of view
            if (eTime < viewStart || sTime > viewEnd) return;

            const start = Math.max(sTime, viewStart);
            const end = Math.min(eTime, viewEnd);

            const x = (start - viewStart) * pixelsPerMs;
            const w = (end - start) * pixelsPerMs;

            ctx.fillRect(x, 5, Math.max(w, 2), height - 25);
        });

        // Draw events (Detections)
        events.forEach(event => {
            if (!event.timestamp) return;
            const t = new Date(event.timestamp).getTime();
            if (t < viewStart || t > viewEnd) return;

            const x = (t - viewStart) * pixelsPerMs;

            // Color based on class (simple logic for now)
            ctx.fillStyle = event.class_name?.includes('fire') ? '#EF4444' : '#3B82F6'; // Red or Blue
            ctx.globalAlpha = 0.8;
            ctx.fillRect(x - 1, 10, 2, height - 30);
            ctx.globalAlpha = 1.0;
        });

        // Draw current time playhead
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
    }, [startTime, endTime, currentTime, events, sessions, viewStart, viewEnd]);

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
