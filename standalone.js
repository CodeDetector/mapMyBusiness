// Standalone HTTP server for the mapMyBusiness microservice.
//
// Two authentication paths:
//
// 1. Bearer JWT — for direct external callers. Validates the Supabase token.
// 2. Internal service token — for trusted callers on the same Docker network
//    (e.g. wa-field-tracker reverse-proxying user requests, or making service-
//    to-service calls). Caller passes X-Internal-Service-Token and provides the
//    user identity in X-Internal-User-Email / X-Internal-User-Id.

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { createRouter } = require('./router');
const profileService = require('./profileService');
const service = require('./service');

const PORT = process.env.PORT || 3002;
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and SUPABASE_KEY must be set');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } });

async function requireAuth(req, res, next) {
    // Internal service token short-circuit: trust the caller, take user identity
    // from headers. Only safe because omni-business is not exposed publicly.
    const internalToken = req.headers['x-internal-service-token'];
    if (INTERNAL_TOKEN && internalToken === INTERNAL_TOKEN) {
        const email = req.headers['x-internal-user-email'];
        const id = req.headers['x-internal-user-id'];
        if (!email) return res.status(400).json({ error: 'X-Internal-User-Email required for internal calls' });
        req.user = { email, id };
        return next();
    }

    // External Bearer JWT path
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// Internal endpoints — token-only, no user identity required. Used by sibling
// services for read-only data (prompt enrichment, onboarding-status checks).
function requireInternalToken(req, res, next) {
    if (!INTERNAL_TOKEN) return res.status(500).json({ error: 'INTERNAL_SERVICE_TOKEN not configured' });
    if (req.headers['x-internal-service-token'] !== INTERNAL_TOKEN) {
        return res.status(401).json({ error: 'Invalid internal token' });
    }
    next();
}

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'mapMyBusiness' }));

// Internal (sibling-service) endpoints
app.get('/internal/business/profile', requireInternalToken, async (req, res) => {
    try { res.json(await profileService.readProfile()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/internal/onboarding/status', requireInternalToken, async (req, res) => {
    try { res.json(await service.getOnboardingStatus()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// Full business context — used by refinement agents on every refresh.
// One round-trip returns profile + suppliers + clients + employees.
app.get('/internal/business/context', requireInternalToken, async (req, res) => {
    try {
        const [profile, suppliers, clients, employees] = await Promise.all([
            profileService.readProfile(),
            service.getAllSuppliers(),
            service.getAllClients(),
            service.getAllEmployees ? service.getAllEmployees() : [],
        ]);
        res.json({ profile, suppliers, clients, employees });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Public-shape endpoints (mounted via the package router)
app.use('/api', createRouter({ requireAuth }));

app.listen(PORT, () => {
    console.log(`mapMyBusiness listening on :${PORT}`);
});
