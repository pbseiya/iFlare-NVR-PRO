'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from "@/components/layout/Sidebar";

export function ConditionalSidebar() {
    const pathname = usePathname();

    // Hide sidebar on /dashboard route (it has its own sidebar)
    if (pathname === '/dashboard') {
        return null;
    }

    return <Sidebar />;
}
