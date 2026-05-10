// Standalone HTTP server — only used when running this package as its own
// container. The primary integration path is to `require('./router').createRouter`
// from within wa-field-tracker and mount it under /api.

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { createRouter } = require('./router');

const PORT = process.env.PORT || 3002;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and SUPABASE_KEY must be set');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function requireAuth(req, res, next) {
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

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', createRouter({ requireAuth }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'mapMyBusiness' }));

app.listen(PORT, () => {
    console.log(`mapMyBusiness listening on :${PORT}`);
});
