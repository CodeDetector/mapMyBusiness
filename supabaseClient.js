const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

let _client = null;

function getClient() {
    if (_client) return _client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
        throw new Error('mapMyBusiness: SUPABASE_URL and SUPABASE_KEY must be set');
    }
    // Node <22 has no global WebSocket; supabase realtime-js needs one explicitly.
    _client = createClient(url, key, { realtime: { transport: ws } });
    return _client;
}

module.exports = { getClient };
