"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const tenants_1 = __importDefault(require("./routes/tenants"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const sync_1 = __importDefault(require("./routes/sync"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const scheduler_1 = require("./jobs/scheduler");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// CORS configuration
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
}));
// JSON parser with raw body capture for HMAC verification
app.use(express_1.default.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}));
app.use(express_1.default.urlencoded({ extended: true }));
// API v1 Routes
app.use('/api/v1/webhook', webhook_1.default);
app.use('/api/v1/tenants', tenants_1.default);
app.use('/api/v1/sync', sync_1.default);
app.use('/api/v1/analytics', analytics_1.default);
// Health check (keep at root for simple uptime monitoring)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Xeno FDE Backend API',
        version: 'v1',
        docs: '/api/v1',
        health: '/health'
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start the scheduler for periodic sync
    (0, scheduler_1.startScheduler)();
});
exports.default = app;
//# sourceMappingURL=index.js.map