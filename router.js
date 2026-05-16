const express = require('express');
const profileService = require('./profileService');
const service = require('./service');
const { enqueue: enqueueAgentJob } = require('./queue');

// Fire-and-forget enqueue: never blocks the API response.
function fireEnqueue(job) {
    setImmediate(() => {
        enqueueAgentJob(job).catch(err =>
            console.error('mapMyBusiness/router fireEnqueue:', err.message)
        );
    });
}

/**
 * Build an Express router exposing the mapMyBusiness HTTP surface.
 *
 * @param {object} options
 * @param {Function} options.requireAuth - Express middleware that authenticates the request
 *                                         and sets `req.user.email` on success.
 * @returns {express.Router}
 */
function createRouter({ requireAuth }) {
    if (typeof requireAuth !== 'function') {
        throw new Error('mapMyBusiness.createRouter: requireAuth middleware is required');
    }

    const router = express.Router();

    // ─── Business profile ────────────────────────────────────────────────────
    router.get('/business/profile', requireAuth, async (req, res) => {
        try {
            res.json(await profileService.readProfile());
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/business/profile', requireAuth, async (req, res) => {
        try {
            const required = ['name', 'website', 'description', 'industry', 'hq_location'];
            for (const f of required) {
                if (!req.body[f] || !String(req.body[f]).trim()) {
                    return res.status(400).json({ error: `${f} is required` });
                }
            }
            const updated = await profileService.writeProfile(req.body);
            fireEnqueue({
                channel: 'business',
                sourceTable: 'business_profile',
                sourceId: updated?.id ?? null,
                payload: { row: updated, action: 'upsert' },
            });
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Suppliers ───────────────────────────────────────────────────────────
    router.get('/suppliers', requireAuth, async (req, res) => {
        res.json(await service.getAllSuppliers());
    });

    router.post('/suppliers', requireAuth, async (req, res) => {
        const { name, website, description, emailIds, contacts, products } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: 'Supplier name is required' });
        }
        const created = await service.createSupplier({
            name: name.trim(),
            website: website ? String(website).trim() : null,
            description: description ? String(description).trim() : null,
            emailIds: Array.isArray(emailIds) ? emailIds : null,
            contacts: Array.isArray(contacts) ? contacts : null,
            products: Array.isArray(products) ? products : null,
        });
        if (!created) return res.status(500).json({ error: 'Failed to create supplier' });
        fireEnqueue({
            channel: 'business',
            sourceTable: 'suppliers',
            sourceId: created.id,
            payload: { row: created, action: 'insert' },
        });
        res.status(201).json(created);
    });

    // ─── Clients ─────────────────────────────────────────────────────────────
    router.get('/clients', requireAuth, async (req, res) => {
        res.json(await service.getAllClients());
    });

    router.post('/clients', requireAuth, async (req, res) => {
        const { businessName, location, description, emailId, contacts, managedBy, industry, products } = req.body;
        if (!businessName) return res.status(400).json({ error: 'businessName is required' });
        const payload = {
            businessName,
            location: location || null,
            description: description || null,
            emailId: emailId || null,
            contacts: contacts || null,
            managedBy: managedBy || null,
            industry: industry || null,
            products: Array.isArray(products) ? products : null,
        };
        const client = await service.createClient(payload);
        if (!client) return res.status(500).json({ error: 'Failed to create client' });
        fireEnqueue({
            channel: 'business',
            sourceTable: 'clients',
            sourceId: client.id,
            payload: { row: client, action: 'insert' },
        });
        res.status(201).json(client);
    });

    router.patch('/clients/:id/assign', requireAuth, async (req, res) => {
        const clientId = Number(req.params.id);
        const { managedBy } = req.body;
        if (!clientId || !managedBy) return res.status(400).json({ error: 'clientId and managedBy are required' });
        const ok = await service.updateClientManagedBy(clientId, managedBy);
        if (ok) res.json({ success: true });
        else res.status(500).json({ error: 'Failed to assign client' });
    });

    // ─── Employees (invite-gated) ────────────────────────────────────────────
    router.post('/employees', requireAuth, async (req, res) => {
        const employeeData = { ...req.body };
        if (!employeeData.Name || !employeeData.Mobile) {
            return res.status(400).json({ error: 'Name and Mobile are required' });
        }

        // Caller's authenticated email is authoritative — never trust client-supplied emailId
        const authEmail = req.user.email.toLowerCase();
        employeeData.emailId = authEmail;

        const empCount = await service.countEmployees();

        if (empCount === 0) {
            // First-ever signup → becomes Admin
            employeeData.is_admin = true;
            employeeData.invited_by = null;
        } else {
            const invite = await service.getPendingInvitationByEmail(authEmail);
            if (!invite) {
                return res.status(403).json({
                    error: 'Registration is invite-only. Ask an admin to invite your work email.'
                });
            }
            employeeData.is_admin = !!invite.is_admin;
            employeeData.invited_by = invite.invited_by;
            employeeData.department = invite.department || employeeData.department || null;
            employeeData.designation = invite.designation || employeeData.designation || null;
            if (!employeeData.Role) employeeData.Role = invite.role;
            await service.markInvitationAccepted(invite.id);
        }

        const newEmployee = await service.createEmployee(employeeData);
        if (!newEmployee) return res.status(500).json({ error: 'Failed to create employee' });
        fireEnqueue({
            channel: 'business',
            sourceTable: 'employees',
            sourceId: newEmployee.id,
            payload: { row: newEmployee, action: 'insert' },
        });
        res.status(201).json(newEmployee);
    });

    // ─── Invitations ─────────────────────────────────────────────────────────
    router.get('/invitations', requireAuth, async (req, res) => {
        res.json(await service.getInvitations());
    });

    router.post('/invitations', requireAuth, async (req, res) => {
        try {
            const caller = await service.getEmployeeByEmail(req.user.email);
            if (!caller) return res.status(403).json({ error: 'Only registered employees can invite' });

            const { email, role, department, designation, isAdmin } = req.body;
            if (!email || !role) return res.status(400).json({ error: 'email and role are required' });

            const invitation = await service.createInvitation({
                email: String(email).trim().toLowerCase(),
                role,
                department: department || null,
                designation: designation || null,
                is_admin: !!isAdmin,
                invited_by: caller.id,
            });
            if (!invitation) return res.status(500).json({ error: 'Failed to create invitation' });
            fireEnqueue({
                channel: 'business',
                sourceTable: 'employee_invitations',
                sourceId: invitation.id,
                payload: { row: invitation, action: 'insert' },
            });
            res.status(201).json(invitation);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Contacts ────────────────────────────────────────────────────────────
    router.get('/contacts', requireAuth, async (req, res) => {
        const filter = req.query.category ? { category: req.query.category } : {};
        res.json(await service.getAllContacts(filter));
    });

    router.get('/contacts/lookup', requireAuth, async (req, res) => {
        const { phone, jid, lid } = req.query;
        if (!phone && !jid && !lid) {
            return res.status(400).json({ error: 'phone, jid, or lid required' });
        }
        const found = await service.findContactByIdentifier({
            phone, waJid: jid, waLid: lid,
        });
        res.json({ contact: found || null });
    });

    router.post('/contacts', requireAuth, async (req, res) => {
        const { name, category } = req.body;
        if (!name || !category) {
            return res.status(400).json({ error: 'name and category are required' });
        }
        if (!['employee','supplier','client','other'].includes(category)) {
            return res.status(400).json({ error: 'invalid category' });
        }
        // Force org existence for supplier/client categories
        if (category === 'supplier' && !req.body.supplier_id) {
            return res.status(400).json({ error: 'supplier_id required for category=supplier' });
        }
        if (category === 'client' && !req.body.client_id) {
            return res.status(400).json({ error: 'client_id required for category=client' });
        }

        // For employee, create the employees row first and link it
        if (category === 'employee' && !req.body.employee_id) {
            const emp = await service.createEmployee({
                Name:    req.body.name,
                emailId: req.body.email   || null,
                Role:    req.body.role    || null,
                Mobile:  req.body.phone   || null,
                contact: req.body.phone   || null,
            });
            // createEmployee already mirrors a contacts row, so just return it
            const linked = await service.findContactByIdentifier({
                phone: req.body.phone,
            });
            return res.json(linked || { id: null, employee_id: emp?.id });
        }

        const created = await service.createContact(req.body);
        if (!created) return res.status(500).json({ error: 'failed to create contact' });
        res.json(created);
    });

    router.put('/contacts/:id', requireAuth, async (req, res) => {
        const updated = await service.updateContact(req.params.id, req.body);
        if (!updated) return res.status(500).json({ error: 'failed to update contact' });
        res.json(updated);
    });

    // ─── Onboarding status ───────────────────────────────────────────────────
    router.get('/onboarding/status', requireAuth, async (req, res) => {
        try {
            res.json(await service.getOnboardingStatus());
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = { createRouter };
