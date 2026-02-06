'use client';

import { useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SessionInfo } from '@/lib/api';
import { drawDetections, getRecentDetections, DrawDetectionsOptions } from '@/lib/detection-utils';

interface LiveCameraFeedProps {
    session: SessionInfo;
    options: DrawDetectionsOptions;
}

export default function LiveCameraFeed({ session, options }: LiveCameraFeedProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isRunning = session.status === 'running';

    // Fetch detections for live sessions
    const { data: detections = [] } = useQuery({
        queryKey: ['detections', session.id],
        queryFn: () => api.getDetections(session.id, 1000),
        enabled: isRunning,
        refetchInterval: isRunning ? 2000 : false,
    });

    // Video source for live streaming
    const videoSrc = isRunning
        ? `http://localhost:8000/api/video/stream/${session.id}`
        : undefined;

    // Draw detections on canvas overlay
    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || !isRunning) return;

        let animationFrameId: number;

        const render = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Only draw if video has dimensions
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                // Get recent detections (last 5 seconds)
                const recentDetections = getRecentDetections(detections, 5000);

                if (recentDetections.length > 0) {
                    drawDetections(ctx, canvas, recentDetections, {
                        width: video.videoWidth,
                        height: video.videoHeight,
                    }, options);
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [detections, options, isRunning]);

    // Sync canvas size with video
    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) return;

        const updateCanvasSize = () => {
            canvas.width = video.clientWidth;
            canvas.height = video.clientHeight;
        };

        video.addEventListener('loadedmetadata', updateCanvasSize);
        window.addEventListener('resize', updateCanvasSize);

        return () => {
            video.removeEventListener('loadedmetadata', updateCanvasSize);
            window.removeEventListener('resize', updateCanvasSize);
        };
    }, []);

    return (
        <div className="relative w-full h-full bg-gray-950">
            {isRunning && videoSrc ? (
                <>
                    {/* Video Element */}
                    <video
                        ref={videoRef}
                        src={videoSrc}
                        autoPlay
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-contain"
                    />
                    {/* Canvas Overlay for Detections */}
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full pointer-events-none"
                    />
                </>
            ) : (
                // Placeholder for stopped sessions
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-600">No Stream</p>
                        <p className="text-xs text-gray-700 mt-1">Session #{session.id}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
