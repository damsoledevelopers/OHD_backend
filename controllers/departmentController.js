const mongoose = require('mongoose');
const Department = require('../models/Department');

function normalizeName(raw) {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/** Public + admin: plain sorted names. */
async function listDepartmentNames(req, res) {
  try {
    const docs = await Department.find().sort({ nameNormalized: 1 }).select('name').lean();
    res.json({ departments: docs.map((d) => d.name) });
  } catch (err) {
    console.error('listDepartmentNames', err);
    res.status(500).json({ error: 'Failed to load departments' });
  }
}

/** Admin: list with ids for edit/delete. */
async function listDepartmentsAdmin(req, res) {
  try {
    const docs = await Department.find().sort({ nameNormalized: 1 }).select('name').lean();
    res.json({
      departments: docs.map((d) => ({ _id: d._id.toString(), name: d.name })),
    });
  } catch (err) {
    console.error('listDepartmentsAdmin', err);
    res.status(500).json({ error: 'Failed to load departments' });
  }
}

async function createDepartment(req, res) {
  try {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const doc = await Department.create({ name });
    res.status(201).json({ department: { _id: doc._id.toString(), name: doc.name } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    console.error('createDepartment', err);
    res.status(500).json({ error: 'Failed to create department' });
  }
}

async function updateDepartment(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const nextNorm = name.toLowerCase();
    const conflict = await Department.findOne({
      nameNormalized: nextNorm,
      _id: { $ne: id },
    }).lean();
    if (conflict) {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    const doc = await Department.findById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Department not found' });
    }
    doc.name = name;
    await doc.save();
    res.json({ department: { _id: doc._id.toString(), name: doc.name } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    console.error('updateDepartment', err);
    res.status(500).json({ error: 'Failed to update department' });
  }
}

async function deleteDepartment(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const doc = await Department.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteDepartment', err);
    res.status(500).json({ error: 'Failed to delete department' });
  }
}

/**
 * Merge file upload names into DB (case-insensitive skip duplicates).
 * Returns same shape the old localStorage merge used for toasts.
 */
async function bulkImportDepartments(req, res) {
  try {
    const { names } = req.body;
    if (!Array.isArray(names)) {
      return res.status(400).json({ error: 'names must be an array' });
    }

    const existing = await Department.find().select('nameNormalized').lean();
    const existingSet = new Set(existing.map((e) => e.nameNormalized));
    const seenIncoming = new Set();
    let added = 0;
    let skippedDuplicate = 0;

    for (const raw of names) {
      const t = normalizeName(raw);
      if (!t) continue;
      const k = t.toLowerCase();
      if (existingSet.has(k)) {
        skippedDuplicate++;
        continue;
      }
      if (seenIncoming.has(k)) {
        skippedDuplicate++;
        continue;
      }
      seenIncoming.add(k);
      try {
        await Department.create({ name: t });
        existingSet.add(k);
        added++;
      } catch (e) {
        if (e.code === 11000) {
          skippedDuplicate++;
        } else {
          throw e;
        }
      }
    }

    const listDocs = await Department.find().sort({ nameNormalized: 1 }).select('name').lean();
    res.json({
      added,
      skippedDuplicate,
      departments: listDocs.map((d) => d.name),
    });
  } catch (err) {
    console.error('bulkImportDepartments', err);
    res.status(500).json({ error: 'Failed to import departments' });
  }
}

module.exports = {
  listDepartmentNames,
  listDepartmentsAdmin,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  bulkImportDepartments,
};
