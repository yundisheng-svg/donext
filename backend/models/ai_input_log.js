const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

module.exports = (sequelize) => {
    const AiInputLog = sequelize.define(
        'AiInputLog',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                defaultValue: uid,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            text: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            created_tasks_count: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            error: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            tableName: 'ai_input_logs',
            indexes: [
                {
                    fields: ['user_id', 'created_at'],
                },
            ],
        }
    );

    return AiInputLog;
};
