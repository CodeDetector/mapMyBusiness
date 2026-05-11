// Refinement-agent enqueue helper (mapMyBusiness side).
// Mirror of wa-field-tracker/core/agents/queue.js — kept in sync by hand.

const { getClient } = require('./supabaseClient');

async function enqueue({ channel, sourceTable, sourceId, payload }) {
    if (!channel || !sourceTable) {
        console.error('mapMyBusiness/queue.enqueue: channel and sourceTable required');
        return null;
    }
    try {
        const { data, error } = await getClient()
            .from('agent_jobs')
            .insert([{
                channel,
                source_table: sourceTable,
                source_id: sourceId ?? null,
                payload: payload || {},
            }])
            .select('id')
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        // Never block the API path on queue failures.
        console.error('mapMyBusiness/queue.enqueue failed:', err.message);
        return null;
    }
}

module.exports = { enqueue };
