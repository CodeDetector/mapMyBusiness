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
        return data;
    } catch (err) {
        console.error('createEmployee failed:', err.message);
        return null;
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
        const { data, error } = await getClient()
            .from('employee_invitations')
            .upsert([invitationData], { onConflict: 'email' })
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

// ─── Onboarding status ──────────────────────────────────────────────────────

async function getOnboardingStatus() {
    try {
        const c = getClient();
        const [
            { count: businessCount },
            { count: supplierCount },
            { count: clientCount },
            { count: adminCount },
            { count: employeeCount },
        ] = await Promise.all([
            c.from('business_profile').select('*', { count: 'exact', head: true }),
            c.from('suppliers').select('*', { count: 'exact', head: true }),
            c.from('clients').select('*', { count: 'exact', head: true }),
            c.from('employees').select('*', { count: 'exact', head: true }).eq('is_admin', true),
            c.from('employees').select('*', { count: 'exact', head: true }),
        ]);
        return {
            hasBusiness:   (businessCount || 0) > 0,
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
    countEmployees, getEmployeeByEmail, createEmployee,
    // invitations
    getInvitations, createInvitation, getPendingInvitationByEmail, markInvitationAccepted,
    // onboarding
    getOnboardingStatus,
};
