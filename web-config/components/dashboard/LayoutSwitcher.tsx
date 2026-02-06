'use client';

import { Grid3x3, Grid2x2, Square, LayoutGrid } from 'lucide-react';

type GridLayout = '1x1' | '2x2' | '3x3' | '4x4';

interface LayoutSwitcherProps {
    currentLayout: GridLayout;
    onLayoutChange: (layout: GridLayout) => void;
}

export default function LayoutSwitcher({ currentLayout, onLayoutChange }: LayoutSwitcherProps) {
    const layouts: { value: GridLayout; icon: any; label: string }[] = [
        { value: '1x1', icon: Square, label: '1×1' },
        { value: '2x2', icon: Grid2x2, label: '2×2' },
        { value: '3x3', icon: Grid3x3, label: '3×3' },
        { value: '4x4', icon: LayoutGrid, label: '4×4' },
    ];

    return (
        <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-2 border border-gray-800">
            <span className="text-xs text-gray-400 font-medium px-2">Layout</span>
            <div className="flex gap-1">
                {layouts.map(({ value, icon: Icon, label }) => (
                    <button
                        key={value}
                        onClick={() => onLayoutChange(value)}
                        className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                            ${currentLayout === value
                                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                            }
                        `}
                        title={`${label} Grid`}
                    >
                        <Icon size={14} />
                        <span>{label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
