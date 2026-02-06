"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, SessionConfig, SessionInfo } from "@/lib/api";
import { Activity, Cpu, HardDrive, Plus, RefreshCw, X } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import SessionCard from "@/components/dashboard/SessionCard";
import { NewSessionForm } from "@/components/dashboard/NewSessionForm";
import { Modal } from "@/components/Modal";
import { EditSessionModal } from "@/components/EditSessionModal";

export default function DashboardPage() {
    const queryClient = useQueryClient();
    const [editSession, setEditSession] = useState<SessionInfo | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; sessionId: number | null }>({ show: false, sessionId: null });

    // Queries
    const { data: sessionsData, isLoading } = useQuery({
        queryKey: ["sessions"],
        queryFn: () => api.listSessions({ limit: 10 }),
        refetchInterval: 2000,
    });

    // Mutations
    const createSessionMutation = useMutation({
        mutationFn: api.createSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
            setIsFormOpen(false);
        },
        onError: (error: any) => alert(`Error: ${error.message}`),
    });

    const stopSessionMutation = useMutation({
        mutationFn: (id: number) => api.stopSession(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    });

    const resumeSessionMutation = useMutation({
        mutationFn: api.resumeSession,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    });

    const deleteSessionMutation = useMutation({
        mutationFn: api.deleteSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
            setDeleteConfirm({ show: false, sessionId: null });
        },
        onError: (error: any) => {
            alert(`Failed to delete session: ${error.message}`);
        },
    });

    // Derived State
    const activeSessions = sessionsData?.sessions.filter(s => s.status === 'running') || [];
    const totalDetections = sessionsData?.sessions.reduce((acc, s) => acc + (s.total_detections || 0), 0) || 0;

    return (
        <div className="space-y-8">
            {/* Header / Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Active Sessions"
                    value={activeSessions.length}
                    icon={Activity}
                    trend={activeSessions.length > 0 ? "Running" : "Idle"}
                    trendUp={activeSessions.length > 0}
                />
                <StatCard
                    title="Total Detections"
                    value={totalDetections.toLocaleString()}
                    icon={Cpu}
                    className="border-l-4 border-l-purple-500"
                />
                <StatCard
                    title="System Status"
                    value="Online"
                    icon={HardDrive}
                    trend="Stable"
                    trendUp={true}
                />
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                {/* Left Column: Session List (Takes up 2/3 on large screens) */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Live Operations</h2>
                        <button
                            onClick={() => setIsFormOpen(!isFormOpen)}
                            className="xl:hidden flex items-center gap-2 text-sm font-medium text-blue-600"
                        >
                            <Plus size={16} /> New Session
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="text-center py-12 text-slate-400">Loading sessions...</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {sessionsData?.sessions.map((session) => (
                                <SessionCard
                                    key={session.id}
                                    session={session}
                                    onStop={(id) => stopSessionMutation.mutate(id)}
                                    onResume={(id) => resumeSessionMutation.mutate(id)}
                                    onDelete={(id) => setDeleteConfirm({ show: true, sessionId: id })}
                                    onEdit={setEditSession}
                                    isStopping={stopSessionMutation.isPending}
                                    isResuming={resumeSessionMutation.isPending}
                                    isDeleting={deleteSessionMutation.isPending}
                                />
                            ))}
                            {sessionsData?.sessions.length === 0 && (
                                <div className="col-span-full py-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                                    <p className="text-slate-500">No active sessions.</p>
                                    <button
                                        onClick={() => setIsFormOpen(true)}
                                        className="mt-2 text-blue-600 font-medium hover:underline"
                                    >
                                        Create one now
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Column: Config Form (Sticky on desktop) */}
                <div className="xl:block">
                    <div className={`
                        fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center xl:static xl:bg-transparent xl:p-0 xl:block
                        ${isFormOpen ? 'block' : 'hidden'}
                     `}>
                        <div className="w-full max-w-md xl:max-w-none relative">
                            {/* Close button for mobile modal */}
                            <button
                                onClick={() => setIsFormOpen(false)}
                                className="absolute -top-12 right-0 text-white xl:hidden p-2"
                            >
                                <X size={24} />
                            </button>

                            <NewSessionForm
                                onSubmit={(data) => createSessionMutation.mutate(data)}
                                isLoading={createSessionMutation.isPending}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {deleteConfirm.show && (
                <Modal onClose={() => setDeleteConfirm({ show: false, sessionId: null })}>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl max-w-sm w-full">
                        <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Confirm Delete</h3>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            Are you sure you want to delete session #{deleteConfirm.sessionId}? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm({ show: false, sessionId: null })}
                                className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    console.log("Delete confirmed for session:", deleteConfirm.sessionId);
                                    if (deleteConfirm.sessionId) {
                                        deleteSessionMutation.mutate(deleteConfirm.sessionId);
                                    } else {
                                        console.error("No session ID to delete!");
                                    }
                                }}
                                disabled={deleteSessionMutation.isPending}
                                className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {deleteSessionMutation.isPending ? (
                                    <>
                                        <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    "Delete"
                                )}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {editSession && (
                <EditSessionModal
                    session={editSession}
                    onClose={() => setEditSession(null)}
                    onUpdate={() => {
                        setEditSession(null);
                        queryClient.invalidateQueries({ queryKey: ['sessions'] });
                    }}
                />
            )}
        </div>
    );
}


