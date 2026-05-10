const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getClient() {
    if (_client) return _client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
        throw new Error('mapMyBusiness: SUPABASE_URL and SUPABASE_KEY must be set');
    }
    _client = createClient(url, key);
    return _client;
}

module.exports = { getClient };
