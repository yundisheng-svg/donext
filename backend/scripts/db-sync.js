#!/usr/bin/env node

/**
 * Database Sync Script
 * Syncs the database schema to match model definitions.
 * Uses alter: true to add missing columns without dropping existing data.
 */

require('dotenv').config();
const { sequelize } = require('../models');

async function syncDatabase() {
    try {
        console.log('Syncing database (alter mode)...');

        // alter:true adds any missing columns to existing tables — required so
        // migration-added columns (e.g. users.ai_daily_brief) exist even when the
        // migration chain fails partway on a partially-built schema.
        await sequelize.sync({ alter: true });

        console.log('✅ Database synchronized successfully');
        console.log('All tables/columns are up to date (existing data preserved)');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error syncing database:', error.message);
        process.exit(1);
    }
}

syncDatabase();
