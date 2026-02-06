'use client';

import { useRef, useEffect, useState } from 'react';
import { Detection } from '@/lib/api';

interface TimelineScrubberProps {
    startTime: Date;
    endTime: Date;
    currentTime: Date;
    events: Detection[];
    onSeek: (time: Date) => void;
    height?: number;
    className?: string;
}

export default function TimelineScrubber({
    startTime,
    endTime,
    currentTime,
    events,
    onSeek,
    height = 60,
    className = ''
}: TimelineScrubberProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Timeline range (zoom level) - default to full duration
    const [viewStart, setViewStart] = useState(startTime.getTime());
    const [viewEnd, setViewEnd] = useState(endTime.getTime());

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

            // Round to nice intervals (1s, 10s, 1m, 5m, 10m, 1h)
            const intervals = [
                1000, 10000, 60000, 300000, 600000, 3600000
            ];
            const interval = intervals.find(i => i >= msPerTick) || 3600000;

            const firstTick = Math.ceil(viewStart / interval) * interval;

            for (let t = firstTick; t <= viewEnd; t += interval) {
                const x = (t - viewStart) * pixelsPerMs;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();

                const date = new Date(t);
                const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: interval < 60000 ? '2-digit' : undefined });
                ctx.fillText(label, x, canvas.height - 5);
            }
        };
        updateGrid();

        // Draw events
        events.forEach(event => {
            if (!event.timestamp) return;
            const t = new Date(event.timestamp).getTime();
            if (t < viewStart || t > viewEnd) return;

            const x = (t - viewStart) * pixelsPerMs;

            // Color based on class (simple logic for now)
            ctx.fillStyle = event.class_name?.includes('fire') ? '#EF4444' : '#3B82F6';
            ctx.globalAlpha = 0.6;
            ctx.fillRect(x - 2, 10, 4, height - 30);
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
    }, [startTime, endTime, currentTime, events, viewStart, viewEnd]);

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
            className={`relative w-full overflow-hidden select-none cursor-pointer bg-gray-900 border-t border-gray-800 ${className}`}
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
