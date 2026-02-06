'use client';

import { useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SessionInfo } from '@/lib/api';
import { getClassColor, DrawDetectionsOptions } from '@/lib/detection-utils';

interface LiveCameraFeedProps {
    session: SessionInfo;
    options: DrawDetectionsOptions;
}

export default function LiveCameraFeed({ session, options }: LiveCameraFeedProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const latestDataRef = useRef<any>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const togglesRef = useRef(options);
    const isRunning = session.status === 'running';

    // Update toggles ref when options change
    useEffect(() => {
        togglesRef.current = options;
        if (latestDataRef.current) {
            draw();
        }
    }, [options]);

    // Draw function - renders frame and detections on canvas
    const draw = () => {
        const canvas = canvasRef.current;
        const data = latestDataRef.current;
        const img = imgRef.current;
        const currentToggles = togglesRef.current;

        if (canvas && data && img) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Set canvas size to match container
                canvas.width = canvas.parentElement?.clientWidth || 640;
                canvas.height = canvas.parentElement?.clientHeight || 360;

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Calculate scaling to fit image (object-fit: contain)
                const hRatio = canvas.width / img.width;
                const vRatio = canvas.height / img.height;
                const ratio = Math.min(hRatio, vRatio);
                const centerShift_x = (canvas.width - img.width * ratio) / 2;
                const centerShift_y = (canvas.height - img.height * ratio) / 2;

                // Draw the frame
                ctx.drawImage(img, 0, 0, img.width, img.height,
                    centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

                // Draw detections if enabled
                if (currentToggles.showBoxes && data.detections) {
                    ctx.save();
                    ctx.translate(centerShift_x, centerShift_y);
                    ctx.scale(ratio, ratio);

                    data.detections.forEach((d: any) => {
                        const bbox = d.bbox;
                        const className = d.class;
                        const conf = d.conf;

                        const x = bbox[0];
                        const y = bbox[1];
                        const w = bbox[2] - bbox[0];
                        const h = bbox[3] - bbox[1];

                        const color = getClassColor(className);

                        // Draw bounding box
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2 / ratio;
                        ctx.strokeRect(x, y, w, h);

                        // Draw label
                        if (currentToggles.showLabels) {
                            ctx.fillStyle = color;
                            let text = `${className}`;
                            if (currentToggles.showConfidence) {
                                text += ` ${Math.round(conf * 100)}%`;
                            }
                            const fontSize = Math.max(12, 12 / ratio);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            const padding = 5 / ratio;
                            const textMetrics = ctx.measureText(text);
                            const bgHeight = fontSize + padding * 2;
                            ctx.fillRect(x, y - bgHeight, textMetrics.width + padding * 2, bgHeight);

                            ctx.fillStyle = 'white';
                            ctx.fillText(text, x + padding, y - padding);
                        }
                    });

                    ctx.restore();
                }
            }
        }
    };

    // WebSocket connection for live streaming
    useEffect(() => {
        if (!isRunning) return;

        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//localhost:8000/ws/live/${session.id}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'frame' && data.frame) {
                        latestDataRef.current = data;
                        const img = new Image();
                        img.onload = () => {
                            imgRef.current = img;
                            draw();
                        };
                        img.src = `data:image/jpeg;base64,${data.frame}`;
                    }
                } catch (e) {
                    console.error('WebSocket message error:', e);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = () => {
                console.log('WebSocket closed, reconnecting in 3s...');
                retryTimeoutRef.current = setTimeout(connect, 3000);
            };

            ws.onopen = () => {
                console.log('WebSocket connected to session', session.id);
            };
        };

        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
        };
    }, [session.id, isRunning]);

    return (
        <div className="relative w-full h-full bg-gray-950">
            {isRunning ? (
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                />
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
