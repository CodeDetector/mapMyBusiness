const { getClient } = require('./supabaseClient');

const FIELDS = ['name', 'website', 'linkedin', 'description', 'industry', 'hq_location'];

async function readProfile() {
    const { data, error } = await getClient()
        .from('business_profile')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error('readProfile failed:', error.message);
        return null;
    }
    return data || null;
}

async function writeProfile(profile) {
    const payload = {};
    for (const f of FIELDS) {
        if (profile[f] !== undefined) payload[f] = profile[f];
    }

    const existing = await readProfile();
    if (existing) {
        const { data, error } = await getClient()
            .from('business_profile')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    const { data, error } = await getClient()
        .from('business_profile')
        .insert([payload])
        .select()
        .single();
    if (error) throw error;
    return data;
}

function formatProfileForPrompt(profile) {
    if (!profile) return '';
    const lines = [];
    if (profile.name)        lines.push(`Business: ${profile.name}`);
    if (profile.industry)    lines.push(`Industry: ${profile.industry}`);
    if (profile.description) lines.push(`What we do: ${profile.description}`);
    if (profile.hq_location) lines.push(`Headquarters: ${profile.hq_location}`);
    if (profile.website)     lines.push(`Website: ${profile.website}`);
    if (profile.linkedin)    lines.push(`LinkedIn: ${profile.linkedin}`);
    if (!lines.length) return '';
    return ['=== Business Profile ===', ...lines, '========================'].join('\n');
}

module.exports = { readProfile, writeProfile, formatProfileForPrompt };
