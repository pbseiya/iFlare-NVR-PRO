"use client";

import { useState, useEffect } from "react";
import { Database, Server, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";

interface DatabaseConfig {
    provider: string;
    postgres?: {
        url: string;
    };
    sqlserver?: {
        server: string;
        database: string;
        username: string;
        password: string;
        driver: string;
    };
}

interface ConnectionTestResult {
    success: boolean;
    message: string;
    latency_ms?: number;
}

export default function DatabaseSettings() {
    const [provider, setProvider] = useState<"postgres" | "sqlserver">("postgres");
    const [config, setConfig] = useState<DatabaseConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
    const [showRestartModal, setShowRestartModal] = useState(false);

    // PostgreSQL form state
    const [postgresUrl, setPostgresUrl] = useState("");

    // SQL Server form state
    const [sqlserverServer, setSqlserverServer] = useState("");
    const [sqlserverDatabase, setSqlserverDatabase] = useState("");
    const [sqlserverUsername, setSqlserverUsername] = useState("");
    const [sqlserverPassword, setSqlserverPassword] = useState("");
    const [sqlserverDriver, setSqlserverDriver] = useState("{ODBC Driver 18 for SQL Server}");

    // Load current configuration
    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch("/api/settings/database");
            const data = await res.json();
            setConfig(data);
            setProvider(data.provider);

            if (data.provider === "postgres" && data.postgres) {
                setPostgresUrl(data.postgres.url || "");
            } else if (data.provider === "sqlserver" && data.sqlserver) {
                setSqlserverServer(data.sqlserver.server || "");
                setSqlserverDatabase(data.sqlserver.database || "");
                setSqlserverUsername(data.sqlserver.username || "");
                setSqlserverPassword(data.sqlserver.password || "");
                setSqlserverDriver(data.sqlserver.driver || "{ODBC Driver 18 for SQL Server}");
            }
        } catch (error) {
            console.error("Failed to load database config:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const payload: any = { provider };

            if (provider === "postgres") {
                payload.postgres_url = postgresUrl;
            } else {
                payload.sqlserver_server = sqlserverServer;
                payload.sqlserver_database = sqlserverDatabase;
                payload.sqlserver_username = sqlserverUsername;
                payload.sqlserver_password = sqlserverPassword;
                payload.sqlserver_driver = sqlserverDriver;
            }

            const res = await fetch("/api/settings/database/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await res.json();
            setTestResult(result);
        } catch (error: any) {
            setTestResult({
                success: false,
                message: `Test failed: ${error.message}`,
            });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);

        try {
            const payload: any = { provider };

            if (provider === "postgres") {
                payload.postgres_url = postgresUrl;
            } else {
                payload.sqlserver_server = sqlserverServer;
                payload.sqlserver_database = sqlserverDatabase;
                payload.sqlserver_username = sqlserverUsername;
                payload.sqlserver_password = sqlserverPassword;
                payload.sqlserver_driver = sqlserverDriver;
            }

            const res = await fetch("/api/settings/database", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                setShowRestartModal(true);
            } else {
                const error = await res.json();
                alert(`Failed to save: ${error.detail}`);
            }
        } catch (error: any) {
            alert(`Failed to save: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleRestart = async () => {
        setRestarting(true);

        try {
            const res = await fetch("/api/system/restart", {
                method: "POST",
            });

            if (res.ok) {
                const result = await res.json();

                // Show restarting message
                setShowRestartModal(false);

                // Wait for backend to restart and reconnect
                await waitForBackendReady();

                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = "/";
                }, 5000);
            } else {
                alert("Failed to restart backend");
                setRestarting(false);
            }
        } catch (error: any) {
            alert(`Restart failed: ${error.message}`);
            setRestarting(false);
        }
    };

    const waitForBackendReady = async () => {
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
            try {
                const res = await fetch("/api/settings/database");
                if (res.ok) {
                    const data = await res.json();
                    // Check if we're connected to the new provider
                    if (data.provider === provider) {
                        return true;
                    }
                }
            } catch { }

            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        return false;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Database className="w-6 h-6 text-blue-500" />
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                        Database Configuration
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-gray-400">
                        Configure database connection (Admin only)
                    </p>
                </div>
            </div>

            {/* Provider Selector */}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                    Database Provider
                </label>
                <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as "postgres" | "sqlserver")}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                    <option value="postgres">PostgreSQL</option>
                    <option value="sqlserver">SQL Server</option>
                </select>
            </div>

            {/* PostgreSQL Form */}
            {provider === "postgres" && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                            Connection URL
                        </label>
                        <input
                            type="text"
                            value={postgresUrl}
                            onChange={(e) => setPostgresUrl(e.target.value)}
                            placeholder="postgresql://user:password@host:port/database"
                            className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            )}

            {/* SQL Server Form */}
            {provider === "sqlserver" && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                                Server
                            </label>
                            <input
                                type="text"
                                value={sqlserverServer}
                                onChange={(e) => setSqlserverServer(e.target.value)}
                                placeholder="10.30.25.58"
                                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                                Database
                            </label>
                            <input
                                type="text"
                                value={sqlserverDatabase}
                                onChange={(e) => setSqlserverDatabase(e.target.value)}
                                placeholder="iFlare_NVR"
                                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                                Username
                            </label>
                            <input
                                type="text"
                                value={sqlserverUsername}
                                onChange={(e) => setSqlserverUsername(e.target.value)}
                                placeholder="admin"
                                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                value={sqlserverPassword}
                                onChange={(e) => setSqlserverPassword(e.target.value)}
                                placeholder="***"
                                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                            Driver
                        </label>
                        <select
                            value={sqlserverDriver}
                            onChange={(e) => setSqlserverDriver(e.target.value)}
                            className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="{ODBC Driver 18 for SQL Server}">{"{ODBC Driver 18 for SQL Server}"}</option>
                            <option value="{ODBC Driver 17 for SQL Server}">{"{ODBC Driver 17 for SQL Server}"}</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Test Connection Button */}
            <button
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-blue-500 text-blue-500 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {testing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Testing Connection...
                    </>
                ) : (
                    <>
                        <Server className="w-4 h-4" />
                        Test Connection
                    </>
                )}
            </button>

            {/* Test Result */}
            {testResult && (
                <div
                    className={`flex items-start gap-3 p-4 rounded-lg ${testResult.success
                            ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                            : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                        }`}
                >
                    {testResult.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                        <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                        <p
                            className={`font-medium ${testResult.success
                                    ? "text-green-800 dark:text-green-300"
                                    : "text-red-800 dark:text-red-300"
                                }`}
                        >
                            {testResult.message}
                        </p>
                        {testResult.latency_ms && (
                            <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                                Latency: {testResult.latency_ms}ms
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Save Button */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
                {saving ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Saving...
                    </>
                ) : (
                    "Save Configuration"
                )}
            </button>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <span className="text-yellow-600 dark:text-yellow-400 text-lg">⚠️</span>
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    Backend restart required for changes to take effect
                </p>
            </div>

            {/* Restart Modal */}
            {showRestartModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                            Configuration Saved
                        </h3>
                        <p className="text-slate-600 dark:text-gray-300 mb-6">
                            Database configuration has been saved successfully. Would you like to restart the backend now to apply the changes?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowRestartModal(false)}
                                disabled={restarting}
                                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-slate-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                            >
                                Later
                            </button>
                            <button
                                onClick={handleRestart}
                                disabled={restarting}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                            >
                                {restarting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Restarting...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="w-4 h-4" />
                                        Restart Now
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restarting Overlay */}
            {restarting && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 shadow-xl text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                            Restarting Backend...
                        </h3>
                        <p className="text-slate-600 dark:text-gray-300 mb-4">
                            Waiting for backend to reconnect...
                        </p>
                        <p className="text-sm text-slate-500 dark:text-gray-400">
                            You will be redirected to the dashboard shortly.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
