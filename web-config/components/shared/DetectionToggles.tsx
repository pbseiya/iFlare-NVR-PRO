import React from 'react';
import { DetectionFilterState, DetectionFilterActions } from '@/hooks/useDetectionFilter';

interface DetectionTogglesProps {
    filterState: DetectionFilterState;
    actions: DetectionFilterActions;
    className?: string;
}

export const DetectionToggles: React.FC<DetectionTogglesProps> = ({
    filterState,
    actions,
    className = ""
}) => {
    return (
        <div className={`flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700 ${className}`}>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={filterState.showBoxes}
                    onChange={actions.toggleBoxes}
                    className="rounded text-blue-500 focus:ring-blue-500 bg-gray-700 border-gray-600"
                />
                Boxes
            </label>
            <label className={`flex items-center gap-2 text-sm cursor-pointer select-none transition-opacity ${!filterState.showBoxes ? 'opacity-50 cursor-not-allowed' : 'text-gray-300'}`}>
                <input
                    type="checkbox"
                    checked={filterState.showLabels}
                    onChange={actions.toggleLabels}
                    disabled={!filterState.showBoxes}
                    className="rounded text-blue-500 focus:ring-blue-500 bg-gray-700 border-gray-600 disabled:opacity-50"
                />
                Labels
            </label>
            <label className={`flex items-center gap-2 text-sm cursor-pointer select-none transition-opacity ${!filterState.showBoxes || !filterState.showLabels ? 'opacity-50 cursor-not-allowed' : 'text-gray-300'}`}>
                <input
                    type="checkbox"
                    checked={filterState.showConfidence}
                    onChange={actions.toggleConfidence}
                    disabled={!filterState.showBoxes || !filterState.showLabels}
                    className="rounded text-blue-500 focus:ring-blue-500 bg-gray-700 border-gray-600 disabled:opacity-50"
                />
                Confidence
            </label>
        </div>
    );
};
