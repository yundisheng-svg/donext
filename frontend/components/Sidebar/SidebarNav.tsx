import React from 'react';
import { Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ListBulletIcon,
    CalendarIcon,
    Squares2X2Icon,
    ViewColumnsIcon,
} from '@heroicons/react/24/solid';
import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store/useStore';

interface SidebarNavProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
    isDarkMode: boolean;
    openTaskModal: () => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({
    handleNavClick,
    location,
    openTaskModal,
}) => {
    const { t } = useTranslation();
    const eisenhowerEnabled = useStore((state) => state.userSettingsStore.eisenhowerEnabled);
    const kanbanEnabled = useStore((state) => state.userSettingsStore.kanbanEnabled);
    const calendarEnabled = useStore((state) => state.userSettingsStore.calendarEnabled);

    const allNavLinks = [
        {
            path: '/tasks',
            title: t('sidebar.allTasks', 'All Tasks'),
            icon: <ListBulletIcon className="h-5 w-5" />,
        },
        {
            path: '/calendar',
            title: t('sidebar.calendar', 'Calendar'),
            icon: <CalendarIcon className="h-5 w-5" />,
            userFlag: 'calendar',
        },
        {
            path: '/eisenhower',
            title: t('sidebar.eisenhower', 'Eisenhower Matrix'),
            icon: <Squares2X2Icon className="h-5 w-5" />,
            userFlag: 'eisenhower',
        },
        {
            path: '/kanban',
            title: t('sidebar.kanban', 'Kanban Board'),
            icon: <ViewColumnsIcon className="h-5 w-5" />,
            userFlag: 'kanban',
        },
    ];

    const navLinks = allNavLinks.filter((link) => {
        if (link.userFlag === 'eisenhower') return eisenhowerEnabled;
        if (link.userFlag === 'kanban') return kanbanEnabled;
        if (link.userFlag === 'calendar') return calendarEnabled;
        return true;
    });

    const isActive = (path: string) => {
        const isPathMatch = location.pathname === path;
        return isPathMatch
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
            : 'text-gray-700 dark:text-gray-300';
    };

    return (
        <ul className="flex flex-col space-y-1">
            {navLinks.map((link) => (
                <React.Fragment key={link.path}>
                    <li>
                        <button
                            onClick={() =>
                                handleNavClick(link.path, link.title, link.icon)
                            }
                            data-testid={`sidebar-nav-${link.path.replace(/^\//, '')}`}
                            className={`w-full text-left px-4 py-1 flex items-center justify-between rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 ${isActive(
                                link.path
                            )}`}
                        >
                            <div className="flex items-center">
                                {link.icon}
                                <span className="ml-2">{link.title}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {link.path === '/tasks' && (
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openTaskModal();
                                        }}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === 'Enter' ||
                                                e.key === ' '
                                            ) {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                openTaskModal();
                                            }
                                        }}
                                        className="text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white focus:outline-none cursor-pointer"
                                        aria-label={t(
                                            'sidebar.addTaskAriaLabel',
                                            'Add Task'
                                        )}
                                        title={t(
                                            'sidebar.addTaskTitle',
                                            'Add Task'
                                        )}
                                    >
                                        <PlusCircleIcon className="h-5 w-5" />
                                    </div>
                                )}
                            </div>
                        </button>
                    </li>
                </React.Fragment>
            ))}
        </ul>
    );
};

export default SidebarNav;
