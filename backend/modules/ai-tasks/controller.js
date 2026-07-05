'use strict';

const { getAuthenticatedUserId } = require('../../utils/request-utils');
const aiTasksService = require('./service');

const controller = {
    async parseTasks(req, res, next) {
        try {
            const userId = getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
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
