'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ children, onClose }: { children: React.ReactNode, onClose?: () => void }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
            setMounted(false);
        };
    }, []);

    if (!mounted) return null;

    // Use inline styles to forcefully override any class-based issues
    const overlayStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999, // Extremely high z-index
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)', // Fallback for backdrop
        backdropFilter: 'blur(4px)',
    };

    return createPortal(
        <div style={overlayStyle}>
            {/* Clickable Backdrop Area */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: -1,
                }}
                onClick={onClose}
            />

            {/* Content Container */}
            <div className="relative z-[100000] w-full max-w-md mx-4">
                {children}
            </div>
        </div>,
        document.body
    );
}
