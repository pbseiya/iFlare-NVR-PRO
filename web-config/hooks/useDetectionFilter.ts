import { useState, useCallback } from 'react';

export interface DetectionFilterState {
    showBoxes: boolean;
    showLabels: boolean;
    showConfidence: boolean;
}

export interface DetectionFilterActions {
    toggleBoxes: () => void;
    toggleLabels: () => void;
    toggleConfidence: () => void;
    setFilter: (newState: Partial<DetectionFilterState>) => void;
}

export const useDetectionFilter = (initialState: DetectionFilterState = {
    showBoxes: true,
    showLabels: true,
    showConfidence: true
}) => {
    const [filterState, setFilterState] = useState<DetectionFilterState>(initialState);

    const toggleBoxes = useCallback(() => {
        setFilterState(prev => ({ ...prev, showBoxes: !prev.showBoxes }));
    }, []);

    const toggleLabels = useCallback(() => {
        setFilterState(prev => ({ ...prev, showLabels: !prev.showLabels }));
    }, []);

    const toggleConfidence = useCallback(() => {
        setFilterState(prev => ({ ...prev, showConfidence: !prev.showConfidence }));
    }, []);

    const setFilter = useCallback((newState: Partial<DetectionFilterState>) => {
        setFilterState(prev => ({ ...prev, ...newState }));
    }, []);

    return {
        ...filterState,
        toggleBoxes,
        toggleLabels,
        toggleConfidence,
        setFilter,
        filterState // Return the full object for passing to components
    };
};
