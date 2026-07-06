'use strict';

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const moment = require('moment-timezone');
const { User, Project, Task, AiInputLog } = require('../../models');

// P0 = highest urgency; backend priority ints are 0=low, 1=medium, 2=high
const PRIORITY_MAP = { P0: 2, P1: 1, P2: 0 };

const SPLIT_RULES_PATH = path.join(__dirname, 'TASK_SPLIT_RULES.md');

// 每次调用都重新读取这个文件,这样修改规则文档立即生效,不需要重启服务。
function loadSplitRules() {
    try {
        return fs.readFileSync(SPLIT_RULES_PATH, 'utf8');
    } catch (err) {
        // .md 文件没随镜像打包时(被 .dockerignore 排除等),回退到内置副本,
        // 保证 AI 拆分依然能用。
        return require('./TASK_SPLIT_RULES.js');
    }
}

function getClient() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return null;
    }
    return new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
}

// 调用 DeepSeek 把一段话拆成多个任务。任何失败都抛出,由上层决定是否回退。
async function callAi(text, timezone, projectNames) {
    const client = getClient();
    if (!client) {
        const err = new Error('DEEPSEEK_API_KEY is not set');
        err.code = 'NO_API_KEY';
        throw err;
    }
    const now = moment().tz(timezone);
    const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: [
                    loadSplitRules(),
                    '',
                    '=== 本次请求的动态上下文 ===',
                    `- 今天是 ${now.format('YYYY-MM-DD')}(${now.format('dddd')},时区 ${timezone})。`,
                    `- 用户现有的项目列表是: ${projectNames.length ? projectNames.join('、') : '(暂无项目)'}`,
                ].join('\n'),
            },
            { role: 'user', content: text },
        ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
        throw new Error('AI did not return a result');
    }
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.tasks)) {
        throw new Error('AI returned an unexpected format');
    }
    return parsed.tasks;
}

// 没有 AI 或 AI 失败时的兜底:把每一行(非空)当作一个独立任务。
function fallbackParse(text) {
    const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const source = lines.length ? lines : [text.trim()];
    return source
        .filter(Boolean)
        .map((line) => ({ name: line.slice(0, 255) }));
}

// 把日志写进 ai_input_logs,但绝不因为日志失败而让整个请求 500。
async function safeLog(fields) {
    try {
        await AiInputLog.create(fields);
    } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to write ai_input_log:', logErr.message);
    }
}

async function parseAndCreateTasks(userId, text) {
    if (!text || !text.trim()) {
        const err = new Error('Text is required');
        err.code = 'BAD_INPUT';
        throw err;
    }

    const user = await User.findByPk(userId, {
        attributes: ['id', 'timezone'],
    });
    const timezone = user?.timezone || 'UTC';

    const projects = await Project.findAll({
        where: { user_id: userId },
        attributes: ['id', 'name', 'status'],
        order: [['created_at', 'ASC']],
    });
    const projectNames = projects.map((p) => p.name);

    // 先尝试用 AI 拆分;任何失败(没配 key、网络错误、额度用尽、返回格式不对)
    // 都回退到"每行一个任务",保证提交永远不会报 500。
    let parsedTasks;
    let aiErrorMessage = null;
    let usedFallback = false;
    try {
        parsedTasks = await callAi(text, timezone, projectNames);
        if (!parsedTasks.length) {
            usedFallback = true;
            parsedTasks = fallbackParse(text);
        }
    } catch (aiError) {
        aiErrorMessage = aiError.message || 'AI unavailable';
        usedFallback = true;
        parsedTasks = fallbackParse(text);
    }

    const projectByName = new Map(
        projects.map((p) => [p.name.trim().toLowerCase(), p])
    );
    const createdProjects = [];
    const createdTasks = [];

    for (const t of parsedTasks) {
        if (!t.name || !t.name.trim()) continue;

        let projectId = null;
        if (t.project && t.project.trim()) {
            const key = t.project.trim().toLowerCase();
            let project = projectByName.get(key);
            if (!project) {
                project = await Project.create({
                    name: t.project.trim(),
                    user_id: userId,
                    status: 'in_progress',
                });
                projectByName.set(key, project);
                createdProjects.push(project.name);
            }
            projectId = project.id;
        }

        const attributes = {
            name: t.name.trim(),
            user_id: userId,
            status: 0,
            priority:
                t.priority && PRIORITY_MAP[t.priority] !== undefined
                    ? PRIORITY_MAP[t.priority]
                    : 0,
            note: t.note || null,
            project_id: projectId,
        };
        if (t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)) {
            attributes.due_date = t.due_date;
        }

        const task = await Task.create(attributes);
        createdTasks.push({
            uid: task.uid,
            name: task.name,
            due_date: t.due_date || null,
            priority: t.priority || null,
            project: t.project || null,
            note: t.note || null,
        });
    }

    await safeLog({
        user_id: userId,
        text,
        created_tasks_count: createdTasks.length,
        error: aiErrorMessage ? aiErrorMessage.slice(0, 1000) : null,
    });

    return {
        tasks: createdTasks,
        created_projects: createdProjects,
        used_fallback: usedFallback,
    };
}

async function getHistory(userId, limit = 200) {
    const logs = await AiInputLog.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        limit,
        attributes: [
            'uid',
            'text',
            'created_tasks_count',
            'error',
            'created_at',
        ],
    });
    return logs.map((l) => l.toJSON());
}

module.exports = { parseAndCreateTasks, getHistory };
