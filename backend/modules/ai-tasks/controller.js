'use strict';

const { getAuthenticatedUserId } = require('../../utils/request-utils');
const aiTasksService = require('./service');
const { AiInputLog } = require('../../models');
const { Op } = require('sequelize');

// Daily cap on AI calls across all users, so a public demo can't
// exhaust the LLM API budget. Counted from ai_input_logs.
const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || '100', 10);

async function isOverDailyLimit() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const count = await AiInputLog.count({
        where: { createdAt: { [Op.gte]: startOfDay } },
    });
    return count >= AI_DAILY_LIMIT;
}

const controller = {
    async parseTasks(req, res, next) {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            if (await isOverDailyLimit()) {
                return res.status(429).json({
                    error: 'Daily AI quota reached. Please try again tomorrow.',
                });
            }
            const { text } = req.body;
            const result = await aiTasksService.parseAndCreateTasks(
                userId,
                text
            );
            res.json(result);
        } catch (error) {
            if (error.code === 'NO_API_KEY' || error.code === 'BAD_INPUT') {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    },

    async getHistory(req, res, next) {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const history = await aiTasksService.getHistory(userId);
            res.json({ history });
        } catch (error) {
            next(error);
        }
    },
};

module.exports = controller;
