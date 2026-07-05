'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./controller');

router.post('/ai/parse-tasks', controller.parseTasks);
router.get('/ai/history', controller.getHistory);

module.exports = router;
