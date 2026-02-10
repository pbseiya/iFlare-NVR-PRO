// API Client for YOLOv11 Backend
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Helper to ensure timestamps from backend (naive UTC) are treated as UTC by frontend
const ensureUtc = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    return dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`;
};

export const LANGUAGE_MODELS = [
    { id: 'python+pytorch', name: 'Python + PyTorch (Default)' },
    { id: 'python+openvino', name: 'Python + OpenVINO' },
    { id: 'cpp+openvino', name: 'C++ + OpenVINO' },
    { id: 'rust+openvino', name: 'Rust + OpenVINO' },
];

// Types
export interface SessionConfig {
    name?: string;
    model_name: string;
    language: 'python+pytorch' | 'python+openvino' | 'cpp+openvino' | 'rust+openvino';
    source_type: 'video' | 'rtsp' | 'webcam';
    source_path: string;
    fps_target: number;
    conf_threshold: number;
    iou_threshold: number;
    save_video: boolean;
    video_output_path?: string | null;
    recording_mode?: 'none' | 'clean' | 'annotated';
    render_mode: 'pipeline' | 'deferred';
    video_height?: number;
}

export interface SessionInfo extends SessionConfig {
    id: number;
    created_at: string;
    ended_at: string | null;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    duration_seconds: number | null;
    total_frames: number | null;
    total_detections: number | null;
    unique_classes: number | null;
    avg_confidence: number | null;
    avg_total_ms: number | null;
    avg_inference_ms: number | null;
}

export interface Detection {
    id?: number;
    session_id: number;
    frame_number: number;
    class_name: string;
    confidence: number;
    bbox_x1: number;
    bbox_y1: number;
    bbox_x2: number;
    bbox_y2: number;
    timestamp: string | null;
    // Optional fields for backward compatibility
    bbox?: number[]; // [x1, y1, x2, y2]
    class?: string;
}

export interface SessionResponse {
    session_id: number;
    status: string;
    message: string;
    created_at: string;
}

export interface VideoSegment {
    id: number;
    session_id: number;
    file_path: string;
    start_time: string;
    end_time: string | null;
    duration_seconds: number | null;
    status: string;
}

export interface SessionListResponse {
    sessions: SessionInfo[];
    total: number;
}

export interface SourceAnalysisResponse {
    width: number;
    height: number;
    fps: number;
    codec?: string;
    estimated_bitrate_bps?: number;
    duration_sec?: number;
    error?: string;
}

// API Functions
export const api = {
    // Health check
    health: async () => {
        const response = await apiClient.get('/health');
        return response.data;
    },

    // Sessions
    createSession: async (config: SessionConfig): Promise<SessionResponse> => {
        const response = await apiClient.post('/api/sessions/start', config);
        return response.data;
    },

    listSessions: async (params?: {
        limit?: number;
        offset?: number;
        status?: string;
    }): Promise<SessionListResponse> => {
        const response = await apiClient.get('/api/sessions', { params });
        // Ensure UTC timestamps for Sessions (DB stores UTC)
        const sessions = response.data.sessions.map((s: SessionInfo) => ({
            ...s,
            created_at: ensureUtc(s.created_at) as string,
            ended_at: ensureUtc(s.ended_at)
        }));
        return { ...response.data, sessions };
        return { ...response.data, sessions };
    },

    getSession: async (sessionId: number): Promise<SessionInfo> => {
        const response = await apiClient.get(`/api/sessions/${sessionId}`);
        const s = response.data;
        return {
            ...s,
            created_at: ensureUtc(s.created_at) as string,
            ended_at: ensureUtc(s.ended_at)
        };
    },

    stopSession: async (sessionId: number, status: string = 'stopped') => {
        const response = await apiClient.post(`/api/sessions/${sessionId}/stop`, null, {
            params: { status },
        });
        return response.data;
    },

    deleteSession: async (sessionId: number) => {
        const response = await apiClient.delete(`/api/sessions/${sessionId}`);
        return response.data;
    },

    // Analysis
    analyzeSource: async (sourcePath: string, sourceType: string) => {
        const response = await apiClient.post<SourceAnalysisResponse>('/api/sessions/analyze-source', {
            source_path: sourcePath,
            source_type: sourceType,
        });
        return response.data;
    },

    resumeSession: async (sessionId: number) => {
        const response = await apiClient.post(`/api/sessions/${sessionId}/resume`);
        return response.data;
    },

    updateSession: async (sessionId: number, updates: Partial<SessionConfig>) => {
        const response = await apiClient.patch(`/api/sessions/${sessionId}`, updates);
        return response.data;
    },

    getDetections: async (sessionId: number, limit: number = 1000, start?: string, end?: string): Promise<Detection[]> => {
        // Strip 'Z' to send local time to backend (which expects naive datetime matching DB)
        const params: any = { limit };
        // Use ISO string, but ensure backend handles timezone correctly.
        // If backend expects naive, we should send naive UTC.
        // Current issue: DB might be storing naive local time.
        // Let's try sending standard ISO format.
        if (start) params.start_time = start.replace('Z', '');
        if (end) params.end_time = end.replace('Z', '');

        const response = await apiClient.get(`/api/sessions/${sessionId}/detections`, {
            params
        });

        let detections: Detection[] = [];
        // Handle direct array or wrapped object
        if (Array.isArray(response.data)) {
            detections = response.data;
        } else {
            detections = response.data.detections || [];
        }

        // Ensure UTC timestamps
        return detections;
    },

    getSessionSegments: async (sessionId: number): Promise<VideoSegment[]> => {
        const response = await apiClient.get(`/api/sessions/${sessionId}/segments`);
        // Ensure UTC timestamps
        return response.data;
    },

    // Video Streaming Helper
    getVideoUrl: (videoPath: string): string => {
        if (!videoPath) return '';
        // Use browser's base URL if available, otherwise fallback to API_BASE_URL
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : API_BASE_URL;
        // Construct the full URL for the video stream endpoint through the Next.js rewrite (if configured) or direct to backend
        // Since we are using a proxy or direct access, let's assume /api routes are handled correctly.
        // If we are on the frontend, we want to hit the backend URL. 
        // Note: The backend endpoint is /api/video/stream?path=...

        // If we are using valid relative paths in the proxy setup:
        return `${API_BASE_URL}/api/video/stream?path=${encodeURIComponent(videoPath)}`;
    },

    // System Settings
    getSystemSettings: async () => {
        const response = await apiClient.get('/api/settings');
        return response.data;
    },

    updateSystemSettings: async (settings: { auto_resume?: boolean }) => {
        const response = await apiClient.post('/api/settings', settings);
        return response.data;
    },
};
