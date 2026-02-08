import { Detection } from './api';

// Color mapping for different detection classes
export const getClassColor = (className: string): string => {
    const lower = className.toLowerCase();
    if (lower.includes('fire_smoke')) return '#ef4444'; // Red
    if (lower.includes('smoke')) return '#a855f7'; // Purple
    if (lower.includes('fire')) return '#eab308'; // Yellow
    if (lower.includes('steam')) return '#22c55e'; // Green
    return '#3b82f6'; // Default Blue (was Red, user asked for Blue in timeline context, safer to default BBox to Blue if unknown)
};

export interface DrawDetectionsOptions {
    showBoxes: boolean;
    showLabels: boolean;
    showConfidence: boolean;
    overlayScale?: number; // Scaling factor for text/padding (default ~0.035 of height)
    strokeScale?: number;  // Scaling factor for line width (default ~0.003 of height)
}

/**
 * Draw detection bounding boxes on canvas overlay
 * Handles scaling and positioning to match video dimensions
 */
export function drawDetections(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    detections: any[],
    sourceDim: { width: number; height: number },
    options: DrawDetectionsOptions
) {
    if (!options.showBoxes) return;

    // Calculate scaling to match object-fit: contain behavior
    const hRatio = canvas.width / sourceDim.width;
    const vRatio = canvas.height / sourceDim.height;
    const ratio = Math.min(hRatio, vRatio);

    // Calculate letterbox offsets (centering)
    const offsetX = (canvas.width - sourceDim.width * ratio) / 2;
    const offsetY = (canvas.height - sourceDim.height * ratio) / 2;

    detections.forEach((d) => {
        const bbox = d.bbox_x1 !== undefined ? [d.bbox_x1, d.bbox_y1, d.bbox_x2, d.bbox_y2] : d.bbox;
        const className = d.class_name || d.class;
        const confidence = d.confidence || d.conf;

        if (!bbox || bbox.length !== 4) return;

        const [x1, y1, x2, y2] = bbox;
        const x = x1 * ratio + offsetX;
        const y = y1 * ratio + offsetY;
        const w = (x2 - x1) * ratio;
        const h = (y2 - y1) * ratio;

        const color = getClassColor(className);

        // Dynamic Scaling Calculations
        const baseHeight = canvas.height;
        const scaleFactorText = options.overlayScale || 0.035;
        const scaleFactorStroke = options.strokeScale || 0.003;

        const fontSize = Math.max(12, Math.round(baseHeight * scaleFactorText));
        const padding = Math.max(4, Math.round(fontSize * 0.4));
        const lineWidth = Math.max(2, Math.round(baseHeight * scaleFactorStroke));

        // Draw bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x, y, w, h);

        // Strict Hierarchy: Only draw labels if showLabels is TRUE
        if (options.showLabels) {
            let labelText = `${className}`;

            // Strict Hierarchy: Only draw confidence if showLabels AND showConfidence are TRUE
            if (options.showConfidence && confidence !== undefined) {
                labelText += ` ${Math.round(confidence * 100)}%`;
            }

            ctx.font = `bold ${fontSize}px sans-serif`;
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = fontSize * 1.2; // approx line height

            // Draw Label Background
            ctx.fillStyle = color;
            ctx.fillRect(x, y - textHeight - padding, textWidth + (padding * 2), textHeight + padding);

            // Draw Label Text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, x + padding, y - (padding * 1.5));
        }
    });
}

/**
 * Get most recent detections for live mode
 * Returns detections from the last 5 seconds
 */
export function getRecentDetections(detections: Detection[], maxAgeMs: number = 5000): Detection[] {
    if (!detections || detections.length === 0) return [];

    const now = Date.now();
    return detections.filter((d) => {
        if (!d.timestamp) return false;
        const detectionTime = new Date(d.timestamp).getTime();
        return now - detectionTime < maxAgeMs;
    });
}
