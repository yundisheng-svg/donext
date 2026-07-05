import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Task } from '../entities/Task';
import { useToast } from './Shared/ToastContext';
import { getApiPath } from '../config/paths';
import { getCsrfToken } from '../utils/csrfService';
import {
    FunnelIcon,
    MicrophoneIcon,
    SparklesIcon,
    TrashIcon,
    CalendarDaysIcon,
    XMarkIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';

/* ------------------------------------------------------------------ */
/* 状态 / 优先级 映射                                                    */
/* ------------------------------------------------------------------ */

type StatusKey =
    | 'not_started'
    | 'in_progress'
    | 'done'
    | 'waiting'
    | 'cancelled';

const STATUS_NUM_TO_NAME: Record<number, string> = {
    0: 'not_started',
    1: 'in_progress',
    2: 'done',
    3: 'archived',
    4: 'waiting',
    5: 'cancelled',
    6: 'planned',
};

const STATUS_ORDER: StatusKey[] = [
    'not_started',
    'in_progress',
    'done',
    'waiting',
    'cancelled',
];

const STATUS_META: Record<StatusKey, { label: string; badge: string }> = {
    not_started: {
        label: '未开始',
        badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    },
    in_progress: {
        label: '进行中',
        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    },
    done: {
        label: '已完成',
        badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    },
    waiting: {
        label: '已延期',
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    },
    cancelled: {
        label: '已取消',
        badge: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 line-through',
    },
};

function toStatusKey(status: Task['status']): StatusKey {
    const name =
        typeof status === 'number' ? STATUS_NUM_TO_NAME[status] : status;
    if (name === 'archived') return 'done';
    if (name === 'planned') return 'not_started';
    if (STATUS_ORDER.includes(name as StatusKey)) return name as StatusKey;
    return 'not_started';
}

type PriorityKey = 'P0' | 'P1' | 'P2';

const PRIORITY_ORDER: PriorityKey[] = ['P0', 'P1', 'P2'];

const PRIORITY_META: Record<
    PriorityKey,
    { label: string; badge: string; backend: string }
> = {
    P0: {
        label: 'P0',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
        backend: 'high',
    },
    P1: {
        label: 'P1',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        backend: 'medium',
    },
    P2: {
        label: 'P2',
        badge: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
        backend: 'low',
    },
};

function toPriorityKey(priority: Task['priority']): PriorityKey {
    const value =
        typeof priority === 'number'
            ? priority
            : priority === 'high'
              ? 2
              : priority === 'medium'
                ? 1
                : 0;
    if (value === 2) return 'P0';
    if (value === 1) return 'P1';
    return 'P2';
}

/* ------------------------------------------------------------------ */
/* 日期工具                                                             */
/* ------------------------------------------------------------------ */

function dueDateStr(task: Task): string | null {
    if (!task.due_date) return null;
    return String(task.due_date).slice(0, 10);
}

function todayStr(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function formatDueDisplay(dateStr: string): string {
    const [, m, d] = dateStr.split('-');
    return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

function endOfWeekStr(): string {
    const d = new Date();
    const day = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() + (7 - day));
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
}

const ACTIVE_STATUSES: StatusKey[] = ['not_started', 'in_progress', 'waiting'];

/* ------------------------------------------------------------------ */
/* 表头筛选下拉                                                          */
/* ------------------------------------------------------------------ */

const HeaderFilter: React.FC<{
    title: string;
    active: boolean;
    children: React.ReactNode;
}> = ({ title, active, children }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    return (
        <div className="relative inline-flex items-center gap-1" ref={ref}>
            <span>{title}</span>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                    active ? 'text-blue-500' : 'text-gray-400'
                }`}
                aria-label={`筛选${title}`}
            >
                <FunnelIcon className="h-3.5 w-3.5" />
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-600 dark:bg-gray-800 font-normal normal-case">
                    {children}
                </div>
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* 语音输入 hook                                                         */
/* ------------------------------------------------------------------ */

const SPEECH_ERROR_MESSAGES: Record<string, string> = {
    'not-allowed':
        '麦克风权限被拒绝,请点击浏览器地址栏的锁形图标允许访问麦克风后重试',
    'service-not-allowed':
        '麦克风权限被拒绝,请点击浏览器地址栏的锁形图标允许访问麦克风后重试',
    'no-speech': '没有检测到声音,请靠近麦克风再试一次',
    'audio-capture': '找不到可用的麦克风设备',
    network: '语音识别服务连接失败,请检查网络后重试',
    aborted: '语音识别已取消',
};

function useSpeechInput(
    onText: (finalText: string) => void,
    onError: (message: string) => void
) {
    const [recording, setRecording] = useState(false);
    const [supported] = useState(
        () =>
            typeof window !== 'undefined' &&
            !!(
                (window as any).SpeechRecognition ||
                (window as any).webkitSpeechRecognition
            )
    );
    const recognitionRef = useRef<any>(null);
    const gotResultRef = useRef(false);
    const erroredRef = useRef(false);
    const manualStopRef = useRef(false);

    const stop = useCallback(() => {
        manualStopRef.current = true;
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setRecording(false);
    }, []);

    const start = useCallback(() => {
        const SR =
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;
        if (!SR) {
            onError('当前浏览器不支持语音输入');
            return;
        }
        try {
            const recognition = new SR();
            recognition.lang = 'zh-CN';
            recognition.continuous = true;
            recognition.interimResults = false;
            gotResultRef.current = false;
            erroredRef.current = false;
            manualStopRef.current = false;
            recognition.onresult = (event: any) => {
                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    i++
                ) {
                    if (event.results[i].isFinal) {
                        gotResultRef.current = true;
                        onText(event.results[i][0].transcript);
                    }
                }
            };
            recognition.onerror = (event: any) => {
                erroredRef.current = true;
                setRecording(false);
                recognitionRef.current = null;
                if (event.error !== 'aborted') {
                    onError(
                        SPEECH_ERROR_MESSAGES[event.error] ||
                            `语音识别出错(${event.error || '未知原因'})`
                    );
                }
            };
            recognition.onend = () => {
                setRecording(false);
                recognitionRef.current = null;
                if (
                    !gotResultRef.current &&
                    !erroredRef.current &&
                    !manualStopRef.current
                ) {
                    onError('没有识别到语音内容,请重试');
                }
            };
            recognitionRef.current = recognition;
            recognition.start();
            setRecording(true);
        } catch (err) {
            onError(
                err instanceof Error
                    ? `语音识别启动失败:${err.message}`
                    : '语音识别启动失败'
            );
        }
    }, [onText, onError]);

    const toggle = useCallback(() => {
        if (recording) stop();
        else start();
    }, [recording, start, stop]);

    useEffect(() => () => recognitionRef.current?.stop(), []);

    return { recording, supported, toggle };
}

/* ------------------------------------------------------------------ */
/* 主组件                                                               */
/* ------------------------------------------------------------------ */

const AllTasks: React.FC = () => {
    const { showSuccessToast, showErrorToast } = useToast();

    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    // 输入框
    const [inputText, setInputText] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // 筛选
    const [nameFilter, setNameFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(
        new Set()
    );
    const [priorityFilter, setPriorityFilter] = useState<Set<PriorityKey>>(
        new Set()
    );
    const [dueFilter, setDueFilter] = useState<
        'all' | 'today' | 'week' | 'overdue' | 'none'
    >('all');
    const [noteFilter, setNoteFilter] = useState('');
    const [todayOnly, setTodayOnly] = useState(false);

    // 行内编辑
    const [editingCell, setEditingCell] = useState<{
        uid: string;
        field: 'name' | 'note' | 'due_date';
    } | null>(null);
    const [editingValue, setEditingValue] = useState('');

    // 批量选择 + 删除确认
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
    const [confirmModal, setConfirmModal] = useState<
        | { type: 'single'; uid: string; name: string }
        | { type: 'batch'; uids: string[] }
        | null
    >(null);
    const [deleting, setDeleting] = useState(false);

    // 历史记录
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyItems, setHistoryItems] = useState<
        Array<{
            uid: string;
            text: string;
            created_tasks_count: number;
            error: string | null;
            created_at: string;
        }>
    >([]);

    const fetchTasks = useCallback(async () => {
        try {
            const response = await fetch(
                getApiPath('tasks?limit=10000&offset=0')
            );
            if (!response.ok) throw new Error('加载任务失败');
            const data = await response.json();
            setTasks(data.tasks || []);
        } catch (err) {
            showErrorToast('加载任务失败,请刷新重试');
        } finally {
            setLoading(false);
        }
    }, [showErrorToast]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    useEffect(() => {
        const onTaskCreated = () => fetchTasks();
        window.addEventListener('taskCreated', onTaskCreated);
        return () => window.removeEventListener('taskCreated', onTaskCreated);
    }, [fetchTasks]);

    /* ---------------- 语音 ---------------- */

    const appendSpeech = useCallback((text: string) => {
        setInputText((prev) => (prev ? prev + text : text));
    }, []);
    const handleSpeechError = useCallback(
        (message: string) => showErrorToast(message),
        [showErrorToast]
    );
    const { recording, supported, toggle } = useSpeechInput(
        appendSpeech,
        handleSpeechError
    );

    /* ---------------- 历史记录 ---------------- */

    const openHistory = useCallback(async () => {
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const response = await fetch(getApiPath('ai/history'));
            if (!response.ok) throw new Error();
            const data = await response.json();
            setHistoryItems(data.history || []);
        } catch {
            showErrorToast('加载历史记录失败');
        } finally {
            setHistoryLoading(false);
        }
    }, [showErrorToast]);

    /* ---------------- 更新 / 删除 ---------------- */

    const patchTask = async (uid: string, fields: Record<string, unknown>) => {
        try {
            const response = await fetch(getApiPath(`task/${uid}`), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': await getCsrfToken(),
                },
                body: JSON.stringify(fields),
            });
            if (!response.ok) throw new Error();
            const updated = await response.json();
            setTasks((prev) =>
                prev.map((t) => (t.uid === uid ? { ...t, ...updated } : t))
            );
        } catch {
            showErrorToast('更新任务失败');
        }
    };

    const deleteTaskByUid = async (uid: string) => {
        const response = await fetch(
            getApiPath(`task/${encodeURIComponent(uid)}`),
            {
                method: 'DELETE',
                headers: { 'x-csrf-token': await getCsrfToken() },
            }
        );
        if (!response.ok) throw new Error();
    };

    const requestDeleteSingle = (uid: string, name: string) => {
        setConfirmModal({ type: 'single', uid, name });
    };

    const requestDeleteBatch = () => {
        if (selectedUids.size === 0) return;
        setConfirmModal({ type: 'batch', uids: Array.from(selectedUids) });
    };

    const runConfirmedDelete = async () => {
        if (!confirmModal || deleting) return;
        setDeleting(true);
        const uids =
            confirmModal.type === 'single'
                ? [confirmModal.uid]
                : confirmModal.uids;
        try {
            await Promise.all(uids.map((uid) => deleteTaskByUid(uid)));
            setTasks((prev) => prev.filter((t) => !uids.includes(t.uid!)));
            setSelectedUids((prev) => {
                const next = new Set(prev);
                uids.forEach((uid) => next.delete(uid));
                return next;
            });
            showSuccessToast(
                uids.length > 1
                    ? `已删除 ${uids.length} 个任务`
                    : '已删除任务'
            );
        } catch {
            showErrorToast('删除任务失败,请重试');
        } finally {
            setDeleting(false);
            setConfirmModal(null);
        }
    };

    const toggleSelectTask = (uid: string) => {
        setSelectedUids((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });
    };

    const toggleSelectionMode = () => {
        setSelectionMode((prev) => {
            if (prev) setSelectedUids(new Set());
            return !prev;
        });
    };

    /* ---------------- 新建 / AI 提交 ---------------- */

    const aiSplitTasks = async () => {
        const text = inputText.trim();
        if (!text || aiLoading) return;
        setAiLoading(true);
        try {
            const response = await fetch(getApiPath('ai/parse-tasks'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': await getCsrfToken(),
                },
                body: JSON.stringify({ text }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'AI 拆分失败');
            }
            setInputText('');
            const projectInfo = data.created_projects?.length
                ? `,新建项目: ${data.created_projects.join('、')}`
                : '';
            showSuccessToast(
                `AI 已创建 ${data.tasks.length} 个任务${projectInfo}`
            );
            fetchTasks();
        } catch (err) {
            showErrorToast(
                err instanceof Error ? err.message : 'AI 拆分失败'
            );
        } finally {
            setAiLoading(false);
        }
    };

    /* ---------------- 排序 + 筛选 ---------------- */

    const displayTasks = useMemo(() => {
        const today = todayStr();
        const weekEnd = endOfWeekStr();

        let list = tasks.filter((t) => !t.parent_task_id);

        if (nameFilter.trim()) {
            const q = nameFilter.trim().toLowerCase();
            list = list.filter((t) => t.name.toLowerCase().includes(q));
        }
        if (noteFilter.trim()) {
            const q = noteFilter.trim().toLowerCase();
            list = list.filter((t) =>
                (t.note || '').toLowerCase().includes(q)
            );
        }
        if (statusFilter.size > 0) {
            list = list.filter((t) => statusFilter.has(toStatusKey(t.status)));
        }
        if (priorityFilter.size > 0) {
            list = list.filter((t) =>
                priorityFilter.has(toPriorityKey(t.priority))
            );
        }
        if (dueFilter !== 'all') {
            list = list.filter((t) => {
                const due = dueDateStr(t);
                if (dueFilter === 'none') return !due;
                if (!due) return false;
                if (dueFilter === 'today') return due === today;
                if (dueFilter === 'week') return due <= weekEnd;
                if (dueFilter === 'overdue')
                    return (
                        due < today &&
                        ACTIVE_STATUSES.includes(toStatusKey(t.status))
                    );
                return true;
            });
        }
        if (todayOnly) {
            list = list.filter((t) => {
                const due = dueDateStr(t);
                return (
                    ACTIVE_STATUSES.includes(toStatusKey(t.status)) &&
                    !!due &&
                    due <= today
                );
            });
        }

        return [...list].sort((a, b) => {
            const aDone = ACTIVE_STATUSES.includes(toStatusKey(a.status))
                ? 0
                : 1;
            const bDone = ACTIVE_STATUSES.includes(toStatusKey(b.status))
                ? 0
                : 1;
            if (aDone !== bDone) return aDone - bDone;

            const aDue = dueDateStr(a);
            const bDue = dueDateStr(b);
            if (aDue && bDue && aDue !== bDue) return aDue < bDue ? -1 : 1;
            if (aDue && !bDue) return -1;
            if (!aDue && bDue) return 1;

            const aP = toPriorityKey(a.priority);
            const bP = toPriorityKey(b.priority);
            if (aP !== bP)
                return PRIORITY_ORDER.indexOf(aP) - PRIORITY_ORDER.indexOf(bP);

            return (b.created_at || '').localeCompare(a.created_at || '');
        });
    }, [
        tasks,
        nameFilter,
        noteFilter,
        statusFilter,
        priorityFilter,
        dueFilter,
        todayOnly,
    ]);

    const anyFilterActive =
        !!nameFilter.trim() ||
        !!noteFilter.trim() ||
        statusFilter.size > 0 ||
        priorityFilter.size > 0 ||
        dueFilter !== 'all' ||
        todayOnly;

    /* ---------------- 行内编辑提交 ---------------- */

    const commitEditingCell = () => {
        if (!editingCell) return;
        const { uid, field } = editingCell;
        const task = tasks.find((t) => t.uid === uid);
        setEditingCell(null);
        if (!task) return;
        const value = editingValue;
        if (field === 'name') {
            const trimmed = value.trim();
            if (trimmed && trimmed !== task.name) {
                patchTask(uid, { name: trimmed });
            }
        } else if (field === 'note') {
            if (value !== (task.note || '')) {
                patchTask(uid, { note: value || null });
            }
        }
    };

    /* ---------------- 渲染 ---------------- */

    const toggleSetItem = <T,>(
        set: Set<T>,
        item: T,
        setter: (s: Set<T>) => void
    ) => {
        const next = new Set(set);
        if (next.has(item)) next.delete(item);
        else next.add(item);
        setter(next);
    };

    return (
        <div className="w-full px-2 sm:px-4 lg:px-6 pt-4 pb-8">
            <div className="w-full max-w-6xl mx-auto">
                {/* 标题 + 历史记录 + 今日任务 + 批量删除按钮 */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-light">全部任务</h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={openHistory}
                            title="查看历史输入记录"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                            <ClockIcon className="h-4 w-4" />
                            历史记录
                        </button>
                        <button
                            type="button"
                            onClick={() => setTodayOnly((v) => !v)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                                todayOnly
                                    ? 'border-blue-500 bg-blue-500 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                            <CalendarDaysIcon className="h-4 w-4" />
                            今日任务
                            {todayOnly && <XMarkIcon className="h-4 w-4" />}
                        </button>
                        <button
                            type="button"
                            onClick={toggleSelectionMode}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                                selectionMode
                                    ? 'border-red-500 bg-red-500 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                            <TrashIcon className="h-4 w-4" />
                            {selectionMode ? '取消删除' : '批量删除'}
                        </button>
                    </div>
                </div>

                {/* 批量操作栏 */}
                {selectionMode && (
                    <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-800 dark:bg-blue-900/20">
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                            已选择 {selectedUids.size} 个任务
                        </span>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedUids(new Set())}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                清空选择
                            </button>
                            <button
                                type="button"
                                onClick={requestDeleteBatch}
                                disabled={selectedUids.size === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <TrashIcon className="h-4 w-4" />
                                确认删除选中项
                            </button>
                        </div>
                    </div>
                )}

                {/* 任务表格 */}
                {loading ? (
                    <p className="text-gray-500">加载中…</p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {selectionMode && (
                                        <th className="px-3 py-3 w-8">
                                            <input
                                                type="checkbox"
                                                checked={
                                                    displayTasks.length > 0 &&
                                                    displayTasks.every((t) =>
                                                        selectedUids.has(
                                                            t.uid!
                                                        )
                                                    )
                                                }
                                                onChange={() => {
                                                    setSelectedUids((prev) => {
                                                        const allSelected =
                                                            displayTasks.length >
                                                                0 &&
                                                            displayTasks.every(
                                                                (t) =>
                                                                    prev.has(
                                                                        t.uid!
                                                                    )
                                                            );
                                                        if (allSelected) {
                                                            const next =
                                                                new Set(prev);
                                                            displayTasks.forEach(
                                                                (t) =>
                                                                    next.delete(
                                                                        t.uid!
                                                                    )
                                                            );
                                                            return next;
                                                        }
                                                        const next = new Set(
                                                            prev
                                                        );
                                                        displayTasks.forEach(
                                                            (t) =>
                                                                next.add(
                                                                    t.uid!
                                                                )
                                                        );
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </th>
                                    )}
                                    <th className="px-4 py-3 min-w-[16rem]">
                                        <HeaderFilter
                                            title="任务名称"
                                            active={!!nameFilter.trim()}
                                        >
                                            <input
                                                type="text"
                                                value={nameFilter}
                                                onChange={(e) =>
                                                    setNameFilter(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="搜索名称…"
                                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            />
                                        </HeaderFilter>
                                    </th>
                                    <th className="px-4 py-3 w-28">
                                        <HeaderFilter
                                            title="状态"
                                            active={statusFilter.size > 0}
                                        >
                                            {STATUS_ORDER.map((key) => (
                                                <label
                                                    key={key}
                                                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={statusFilter.has(
                                                            key
                                                        )}
                                                        onChange={() =>
                                                            toggleSetItem(
                                                                statusFilter,
                                                                key,
                                                                setStatusFilter
                                                            )
                                                        }
                                                    />
                                                    {STATUS_META[key].label}
                                                </label>
                                            ))}
                                        </HeaderFilter>
                                    </th>
                                    <th className="px-4 py-3 w-28">
                                        <HeaderFilter
                                            title="截止日期"
                                            active={dueFilter !== 'all'}
                                        >
                                            {(
                                                [
                                                    ['all', '全部'],
                                                    ['today', '今天'],
                                                    ['week', '本周内'],
                                                    ['overdue', '已过期'],
                                                    ['none', '无日期'],
                                                ] as const
                                            ).map(([key, label]) => (
                                                <label
                                                    key={key}
                                                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                                                >
                                                    <input
                                                        type="radio"
                                                        name="dueFilter"
                                                        checked={
                                                            dueFilter === key
                                                        }
                                                        onChange={() =>
                                                            setDueFilter(key)
                                                        }
                                                    />
                                                    {label}
                                                </label>
                                            ))}
                                        </HeaderFilter>
                                    </th>
                                    <th className="px-4 py-3 w-24">
                                        <HeaderFilter
                                            title="优先级"
                                            active={priorityFilter.size > 0}
                                        >
                                            {PRIORITY_ORDER.map((key) => (
                                                <label
                                                    key={key}
                                                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={priorityFilter.has(
                                                            key
                                                        )}
                                                        onChange={() =>
                                                            toggleSetItem(
                                                                priorityFilter,
                                                                key,
                                                                setPriorityFilter
                                                            )
                                                        }
                                                    />
                                                    {key}
                                                </label>
                                            ))}
                                        </HeaderFilter>
                                    </th>
                                    <th className="px-4 py-3 min-w-[12rem]">
                                        <HeaderFilter
                                            title="备注"
                                            active={!!noteFilter.trim()}
                                        >
                                            <input
                                                type="text"
                                                value={noteFilter}
                                                onChange={(e) =>
                                                    setNoteFilter(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="搜索备注…"
                                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            />
                                        </HeaderFilter>
                                    </th>
                                    <th className="px-2 py-3 w-10" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700/60 dark:bg-gray-900">
                                {displayTasks.map((task) => {
                                    const sKey = toStatusKey(task.status);
                                    const pKey = toPriorityKey(task.priority);
                                    const due = dueDateStr(task);
                                    const overdue =
                                        !!due &&
                                        due < todayStr() &&
                                        ACTIVE_STATUSES.includes(sKey);
                                    const finished =
                                        sKey === 'done' || sKey === 'cancelled';
                                    const isEditing = (
                                        field: 'name' | 'note' | 'due_date'
                                    ) =>
                                        editingCell?.uid === task.uid &&
                                        editingCell.field === field;

                                    return (
                                        <tr
                                            key={task.uid}
                                            className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                                                finished ? 'opacity-55' : ''
                                            }`}
                                        >
                                            {/* 选择框 */}
                                            {selectionMode && (
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedUids.has(
                                                            task.uid!
                                                        )}
                                                        onChange={() =>
                                                            toggleSelectTask(
                                                                task.uid!
                                                            )
                                                        }
                                                    />
                                                </td>
                                            )}
                                            {/* 任务名称 */}
                                            <td className="px-4 py-2">
                                                {isEditing('name') ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editingValue}
                                                        onChange={(e) =>
                                                            setEditingValue(
                                                                e.target.value
                                                            )
                                                        }
                                                        onBlur={
                                                            commitEditingCell
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                'Enter'
                                                            )
                                                                commitEditingCell();
                                                            if (
                                                                e.key ===
                                                                'Escape'
                                                            )
                                                                setEditingCell(
                                                                    null
                                                                );
                                                        }}
                                                        className="w-full rounded border border-blue-400 px-2 py-1 text-sm dark:bg-gray-700 dark:text-white"
                                                    />
                                                ) : (
                                                    <div
                                                        className={`cursor-text ${
                                                            finished
                                                                ? 'line-through text-gray-400'
                                                                : 'text-gray-900 dark:text-gray-100'
                                                        }`}
                                                        title="点击编辑"
                                                        onClick={() => {
                                                            setEditingCell({
                                                                uid: task.uid!,
                                                                field: 'name',
                                                            });
                                                            setEditingValue(
                                                                task.name
                                                            );
                                                        }}
                                                    >
                                                        {task.name}
                                                        {task.Project
                                                            ?.name && (
                                                            <span className="ml-2 rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                                                                {
                                                                    task
                                                                        .Project
                                                                        .name
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 状态 */}
                                            <td className="px-4 py-2">
                                                <select
                                                    value={sKey}
                                                    onChange={(e) =>
                                                        patchTask(task.uid!, {
                                                            status: e.target
                                                                .value,
                                                        })
                                                    }
                                                    className={`cursor-pointer rounded-full border-none px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-blue-400 ${STATUS_META[sKey].badge}`}
                                                >
                                                    {STATUS_ORDER.map(
                                                        (key) => (
                                                            <option
                                                                key={key}
                                                                value={key}
                                                            >
                                                                {
                                                                    STATUS_META[
                                                                        key
                                                                    ].label
                                                                }
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </td>

                                            {/* 截止日期 */}
                                            <td className="px-4 py-2">
                                                {isEditing('due_date') ? (
                                                    <input
                                                        autoFocus
                                                        type="date"
                                                        defaultValue={
                                                            due || ''
                                                        }
                                                        onChange={(e) => {
                                                            patchTask(
                                                                task.uid!,
                                                                {
                                                                    due_date:
                                                                        e
                                                                            .target
                                                                            .value ||
                                                                        null,
                                                                }
                                                            );
                                                            setEditingCell(
                                                                null
                                                            );
                                                        }}
                                                        onBlur={() =>
                                                            setEditingCell(
                                                                null
                                                            )
                                                        }
                                                        className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                    />
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditingCell({
                                                                uid: task.uid!,
                                                                field: 'due_date',
                                                            })
                                                        }
                                                        className={`text-sm ${
                                                            overdue
                                                                ? 'font-medium text-red-500'
                                                                : due
                                                                  ? 'text-gray-700 dark:text-gray-200'
                                                                  : 'text-gray-300 dark:text-gray-600'
                                                        }`}
                                                        title="点击选择日期"
                                                    >
                                                        {due
                                                            ? formatDueDisplay(
                                                                  due
                                                              )
                                                            : '—'}
                                                    </button>
                                                )}
                                            </td>

                                            {/* 优先级 */}
                                            <td className="px-4 py-2">
                                                <select
                                                    value={pKey}
                                                    onChange={(e) =>
                                                        patchTask(task.uid!, {
                                                            priority:
                                                                PRIORITY_META[
                                                                    e.target
                                                                        .value as PriorityKey
                                                                ].backend,
                                                        })
                                                    }
                                                    className={`cursor-pointer rounded-full border-none px-2 py-1 text-xs font-semibold focus:ring-1 focus:ring-blue-400 ${PRIORITY_META[pKey].badge}`}
                                                >
                                                    {PRIORITY_ORDER.map(
                                                        (key) => (
                                                            <option
                                                                key={key}
                                                                value={key}
                                                            >
                                                                {key}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </td>

                                            {/* 备注 */}
                                            <td className="px-4 py-2">
                                                {isEditing('note') ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editingValue}
                                                        onChange={(e) =>
                                                            setEditingValue(
                                                                e.target.value
                                                            )
                                                        }
                                                        onBlur={
                                                            commitEditingCell
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                'Enter'
                                                            )
                                                                commitEditingCell();
                                                            if (
                                                                e.key ===
                                                                'Escape'
                                                            )
                                                                setEditingCell(
                                                                    null
                                                                );
                                                        }}
                                                        className="w-full rounded border border-blue-400 px-2 py-1 text-sm dark:bg-gray-700 dark:text-white"
                                                    />
                                                ) : (
                                                    <div
                                                        className={`cursor-text text-sm ${
                                                            task.note
                                                                ? 'text-gray-600 dark:text-gray-300'
                                                                : 'text-gray-300 dark:text-gray-600'
                                                        }`}
                                                        title="点击编辑备注"
                                                        onClick={() => {
                                                            setEditingCell({
                                                                uid: task.uid!,
                                                                field: 'note',
                                                            });
                                                            setEditingValue(
                                                                task.note || ''
                                                            );
                                                        }}
                                                    >
                                                        {task.note || '—'}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 删除 */}
                                            <td className="px-2 py-2 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        requestDeleteSingle(
                                                            task.uid!,
                                                            task.name
                                                        )
                                                    }
                                                    className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:text-gray-600 dark:hover:bg-red-900/30"
                                                    title="删除任务"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {displayTasks.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={selectionMode ? 7 : 6}
                                            className="px-4 py-16 text-center text-gray-400"
                                        >
                                            {anyFilterActive
                                                ? '没有符合筛选条件的任务'
                                                : '还没有任务,在下面的输入框里创建一个吧'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && (
                    <p className="mt-3 text-center text-xs text-gray-400">
                        共 {displayTasks.length} 个任务
                        {anyFilterActive ? '(已筛选)' : ''}
                        ·已完成/已取消的任务自动排在最后,其余按截止日期从紧到松排序
                    </p>
                )}

                {/* 智能输入框 */}
                <div className="mt-6 rounded-xl border border-gray-300 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-800">
                    <div className="flex items-start gap-2">
                        <textarea
                            ref={inputRef}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    aiSplitTasks();
                                }
                            }}
                            rows={2}
                            placeholder="输入任务或描述一段话,按回车(或点提交)自动拆分成多个任务并归入项目…"
                            className="flex-1 resize-none border-none bg-transparent text-sm focus:outline-none focus:ring-0 dark:text-white"
                            disabled={aiLoading}
                        />
                        <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                                {supported && (
                                    <button
                                        type="button"
                                        onClick={toggle}
                                        title={
                                            recording
                                                ? '停止语音输入'
                                                : '语音输入(说中文)'
                                        }
                                        className={`rounded-full p-2 transition-colors ${
                                            recording
                                                ? 'animate-pulse bg-red-500 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        <MicrophoneIcon className="h-5 w-5" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={aiSplitTasks}
                                    disabled={aiLoading || !inputText.trim()}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <SparklesIcon className="h-4 w-4" />
                                    {aiLoading ? '提交中…' : '提交'}
                                </button>
                            </div>
                            {recording && (
                                <span className="text-xs text-red-500">
                                    正在聆听…再点一次结束
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 删除确认弹窗 */}
            {confirmModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => !deleting && setConfirmModal(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                            {confirmModal.type === 'single'
                                ? '删除任务'
                                : '批量删除任务'}
                        </h3>
                        <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
                            {confirmModal.type === 'single'
                                ? `确定删除任务「${confirmModal.name}」吗?此操作不可撤销。`
                                : `确定删除选中的 ${confirmModal.uids.length} 个任务吗?此操作不可撤销。`}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmModal(null)}
                                disabled={deleting}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={runConfirmedDelete}
                                disabled={deleting}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {deleting ? '删除中…' : '确定删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 历史记录弹窗 */}
            {historyOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => setHistoryOpen(false)}
                >
                    <div
                        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-gray-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                历史输入记录
                            </h3>
                            <button
                                type="button"
                                onClick={() => setHistoryOpen(false)}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-3">
                            {historyLoading ? (
                                <p className="py-8 text-center text-sm text-gray-400">
                                    加载中…
                                </p>
                            ) : historyItems.length === 0 ? (
                                <p className="py-8 text-center text-sm text-gray-400">
                                    还没有历史记录
                                </p>
                            ) : (
                                <ul className="space-y-3">
                                    {historyItems.map((item) => (
                                        <li
                                            key={item.uid}
                                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                                        >
                                            <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
                                                {item.text}
                                            </p>
                                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                                <span>
                                                    {new Date(
                                                        item.created_at
                                                    ).toLocaleString()}
                                                </span>
                                                {item.error ? (
                                                    <span className="text-red-500">
                                                        失败:{item.error}
                                                    </span>
                                                ) : (
                                                    <span className="text-green-600 dark:text-green-400">
                                                        已创建 {item.created_tasks_count} 个任务
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AllTasks;
