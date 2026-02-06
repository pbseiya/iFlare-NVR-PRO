// API Client for YOLOv11 Backend
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

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
    frame_number: number;
    class_name: string;
    confidence: number;
    bbox_x1: number;
    bbox_y1: number;
    bbox_x2: number;
    bbox_y2: number;
    timestamp: string | null;
}

export interface SessionResponse {
    session_id: number;
    status: string;
    message: string;
    created_at: string;
}

export interface SessionListResponse {
    sessions: SessionInfo[];
    total: number;
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
        return response.data;
    },

    getSession: async (sessionId: number): Promise<SessionInfo> => {
        const response = await apiClient.get(`/api/sessions/${sessionId}`);
        return response.data;
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

    resumeSession: async (sessionId: number) => {
        const response = await apiClient.post(`/api/sessions/${sessionId}/resume`);
        return response.data;
    },

    updateSession: async (sessionId: number, updates: Partial<SessionConfig>) => {
        const response = await apiClient.patch(`/api/sessions/${sessionId}`, updates);
        return response.data;
    },

    getDetections: async (sessionId: number, limit: number = 1000): Promise<Detection[]> => {
        const response = await apiClient.get(`/api/sessions/${sessionId}/detections`, {
            params: { limit }
        });
        // Handle direct array or wrapped object
        if (Array.isArray(response.data)) {
            return response.data;
        }
        return response.data.detections || [];
    },

    getSessionSegments: async (sessionId: number): Promise<any[]> => {
        const response = await apiClient.get(`/api/sessions/${sessionId}/segments`);
        return response.data;
    },
};
