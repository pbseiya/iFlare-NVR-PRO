'use client';

import { useAuth, UserRole } from '@/lib/auth';
import { Shield, User } from 'lucide-react';

export default function RoleSwitcher() {
    const { role, setRole, isAdmin } = useAuth();

    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-slate-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-slate-500 dark:text-gray-400" />
                <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">Current Role</span>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => setRole('admin')}
                    className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
                        ${isAdmin
                            ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
                        }
                    `}
                >
                    <div className="flex items-center justify-center gap-1">
                        <Shield size={14} />
                        Admin
                    </div>
                </button>

                <button
                    onClick={() => setRole('user')}
                    className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
                        ${!isAdmin
                            ? 'bg-green-600 dark:bg-green-500 text-white shadow-lg shadow-green-500/20'
                            : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
                        }
                    `}
                >
                    <div className="flex items-center justify-center gap-1">
                        <User size={14} />
                        User
                    </div>
                </button>
            </div>

            <div className="mt-2 text-xs text-slate-500 dark:text-gray-500 text-center">
                {isAdmin ? '✓ Full access (Edit/Delete)' : '✓ Limited access (Stop/Resume)'}
            </div>
        </div>
    );
}
