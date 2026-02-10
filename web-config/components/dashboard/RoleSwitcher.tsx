'use client';

import { useAuth, UserRole } from '@/lib/auth';
import { Shield, User } from 'lucide-react';

export default function RoleSwitcher() {
    const { role, setRole, isAdmin } = useAuth();

    return (
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">Current Role</span>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => setRole('admin')}
                    className={`
                        flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
                        ${isAdmin
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
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
                            ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }
                    `}
                >
                    <div className="flex items-center justify-center gap-1">
                        <User size={14} />
                        User
                    </div>
                </button>
            </div>

            <div className="mt-2 text-xs text-gray-500 text-center">
                {isAdmin ? '✓ Full access (Edit/Delete)' : '✓ Limited access (Stop/Resume)'}
            </div>
        </div>
    );
}
