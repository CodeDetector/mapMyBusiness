const { getClient } = require('./supabaseClient');

// ─── Suppliers ──────────────────────────────────────────────────────────────

async function getAllSuppliers() {
    try {
        const { data, error } = await getClient()
            .from('suppliers')
            .select('*')
            .order('name');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('getAllSuppliers failed:', err.message);
        return [];
    }
}

async function createSupplier(supplierData) {
    try {
        const { data, error } = await getClient()
            .from('suppliers')
            .insert([supplierData])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('createSupplier failed:', err.message);
        return null;
    }
}

// ─── Clients ────────────────────────────────────────────────────────────────

async function getAllClients() {
    try {
        const { data, error } = await getClient()
            .from('clients')
            .select('id, businessName, location, description, emailId, managedBy, industry, products, created_at')
            .order('businessName');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('getAllClients failed:', err.message);
        return [];
    }
}

async function createClient(clientData) {
    try {
        const { data, error } = await getClient()
            .from('clients')
            .insert([clientData])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('createClient failed:', err.message);
        return null;
    }
}

async function updateClientManagedBy(clientId, employeeId) {
    try {
        const { error } = await getClient()
            .from('clients')
            .update({ managedBy: employeeId })
            .eq('id', clientId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('updateClientManagedBy failed:', err.message);
        return false;
    }
}

// ─── Employees ──────────────────────────────────────────────────────────────

async function countEmployees() {
    try {
        const { count, error } = await getClient()
            .from('employees')
            .select('*', { count: 'exact', head: true });
        if (error) throw error;
        return count || 0;
    } catch (err) {
        console.error('countEmployees failed:', err.message);
        return 0;
    }
}

async function getEmployeeByEmail(email) {
    try {
        const { data, error } = await getClient()
            .from('employees')
            .select('*')
            .eq('emailId', email)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    } catch (err) {
        console.error('getEmployeeByEmail failed:', err.message);
        return null;
    }
}

async function createEmployee(employeeData) {
    try {
        const { data, error } = await getClient()
            .from('employees')
            .insert([employeeData])
            .select()
            .single();
        if (error) throw error;

        // Mirror into the unified contacts table so this employee shows up
        // in every roster / matching flow that uses `contacts`. The mirror
        // must inherit the same business_id, or NOT NULL on contacts.business_id
        // would fail this insert.
        if (data?.id) {
            const phone = employeeData.Mobile || employeeData.contact || null;
            await createContact({
                business_id: employeeData.business_id,
                name:        employeeData.Name,
                email:       employeeData.emailId,
                phone,
                role:        employeeData.Role,
                category:    'employee',
                employee_id: data.id,
                wa_jid:      phone ? `${phone}@s.whatsapp.net` : null,
            });
        }
        return data;
    } catch (err) {
        console.error('createEmployee failed:', err.message);
        return null;
    }
}

async function getAllEmployees() {
    try {
        const { data, error } = await getClient()
            .from('employees')
            .select('id, Name, emailId, Role, department, designation, is_admin, managedBy, business_id')
            .order('id');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('getAllEmployees failed:', err.message);
        return [];
    }
}

// ─── Invitations ────────────────────────────────────────────────────────────

async function getInvitations() {
    try {
        const { data, error } = await getClient()
            .from('employee_invitations')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('getInvitations failed:', err.message);
        return [];
    }
}

async function createInvitation(invitationData) {
    try {
        // onConflict now matches the new UNIQUE(business_id, email) in
        // 2026-05-24-multi-tenant-foundation.sql so re-inviting the same
        // address within a tenant updates the row, while the same address
        // can be invited independently by a different tenant.
        const { data, error } = await getClient()
            .from('employee_invitations')
            .upsert([invitationData], { onConflict: 'business_id,email' })
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('createInvitation failed:', err.message);
        return null;
    }
}

async function getPendingInvitationByEmail(email) {
    try {
        const { data, error } = await getClient()
            .from('employee_invitations')
            .select('*')
            .eq('email', email.toLowerCase())
            .eq('status', 'pending')
            .maybeSingle();
        if (error) throw error;
        return data || null;
    } catch (err) {
        console.error('getPendingInvitationByEmail failed:', err.message);
        return null;
    }
}

async function markInvitationAccepted(id) {
    try {
        const { error } = await getClient()
            .from('employee_invitations')
            .update({ status: 'accepted' })
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('markInvitationAccepted failed:', err.message);
        return false;
    }
}

// ─── Contacts (unified roster of every human across employees / suppliers / clients / other) ──

async function getAllContacts(filter = {}) {
    try {
        let q = getClient().from('contacts').select('*').order('name');
        if (filter.category) q = q.eq('category', filter.category);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('getAllContacts failed:', err.message);
        return [];
    }
}

// Look up an existing contact by any WhatsApp identifier or phone.
// Returns the first match (phone > wa_jid > wa_lid priority).
async function findContactByIdentifier({ phone, waJid, waLid }) {
    try {
        const c = getClient();
        if (phone) {
            const { data } = await c.from('contacts').select('*').eq('phone', phone).maybeSingle();
            if (data) return data;
        }
        if (waJid) {
            const { data } = await c.from('contacts').select('*').eq('wa_jid', waJid).maybeSingle();
            if (data) return data;
        }
        if (waLid) {
            const { data } = await c.from('contacts').select('*').eq('wa_lid', waLid).maybeSingle();
            if (data) return data;
        }
        return null;
    } catch (err) {
        console.error('findContactByIdentifier failed:', err.message);
        return null;
    }
}

async function createContact(payload) {
    const row = {
        business_id: payload.business_id,
        name:        payload.name,
        email:       payload.email       || null,
        phone:       payload.phone       || null,
        role:        payload.role        || null,
        category:    payload.category,
        supplier_id: payload.supplier_id || null,
        client_id:   payload.client_id   || null,
        employee_id: payload.employee_id || null,
        other_label: payload.other_label || null,
        wa_jid:      payload.wa_jid      || null,
        wa_lid:      payload.wa_lid      || null,
    };
    try {
        const { data, error } = await getClient()
            .from('contacts')
            .insert([row])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('createContact failed:', err.message);
        return null;
    }
}

async function updateContact(id, patch) {
    try {
        const { data, error } = await getClient()
            .from('contacts')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('updateContact failed:', err.message);
        return null;
    }
}

// ─── Onboarding status ──────────────────────────────────────────────────────

async function getOnboardingStatus(businessId) {
    try {
        const c = getClient();
        // Without a business_id we have no tenant context — treat as
        // "nothing onboarded yet". Callers should only hit this path for
        // orphan users (the wa-field-tracker route skips it in that case).
        if (!businessId) {
            return { hasBusiness: false, supplierCount: 0, clientCount: 0, hasAdmin: false, employeeCount: 0 };
        }
        const [
            { count: supplierCount },
            { count: clientCount },
            { count: adminCount },
            { count: employeeCount },
        ] = await Promise.all([
            c.from('suppliers').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
            c.from('clients').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
            c.from('employees').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_admin', true),
            c.from('employees').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
        ]);
        // hasBusiness is true by construction once we have a business_id —
        // the row necessarily exists because the FK is NOT NULL.
        return {
            hasBusiness:   true,
            supplierCount: supplierCount || 0,
            clientCount:   clientCount || 0,
            hasAdmin:      (adminCount || 0) > 0,
            employeeCount: employeeCount || 0,
        };
    } catch (err) {
        console.error('getOnboardingStatus failed:', err.message);
        return { hasBusiness: false, supplierCount: 0, clientCount: 0, hasAdmin: false, employeeCount: 0 };
    }
}

module.exports = {
    // suppliers
    getAllSuppliers, createSupplier,
    // clients
    getAllClients, createClient, updateClientManagedBy,
    // employees
    countEmployees, getEmployeeByEmail, createEmployee, getAllEmployees,
    // invitations
    getInvitations, createInvitation, getPendingInvitationByEmail, markInvitationAccepted,
    // contacts
    getAllContacts, findContactByIdentifier, createContact, updateContact,
    // onboarding
    getOnboardingStatus,
};
