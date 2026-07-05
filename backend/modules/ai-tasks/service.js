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
    return fs.readFileSync(SPLIT_RULES_PATH, 'utf8');
}

function getClient() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        const err = new Error(
            'DEEPSEEK_API_KEY is not set. 请在 backend/.env 里配置 DEEPSEEK_API_KEY。'
        );
        err.code = 'NO_API_KEY';
        throw err;
    }
    return new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
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
    const now = moment().tz(timezone);

    const projects = await Project.findAll({
        where: { user_id: userId },
        attributes: ['id', 'name', 'status'],
        order: [['created_at', 'ASC']],
    });
    const projectNames = projects.map((p) => p.name);

    try {
        const client = getClient();
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

        const projectByName = new Map(
            projects.map((p) => [p.name.trim().toLowerCase(), p])
        );
        const createdProjects = [];
        const createdTasks = [];

        for (const t of parsed.tasks || []) {
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

        await AiInputLog.create({
            user_id: userId,
            text,
            created_tasks_count: createdTasks.length,
        });

        return { tasks: createdTasks, created_projects: createdProjects };
    } catch (error) {
        await AiInputLog.create({
            user_id: userId,
            text,
            created_tasks_count: 0,
            error: error.message?.slice(0, 1000) || 'unknown error',
        });
        throw error;
    }
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
