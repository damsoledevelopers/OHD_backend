const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  listDepartmentsAdmin,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  bulkImportDepartments,
} = require('../controllers/departmentController');

router.get('/', requireAdmin, listDepartmentsAdmin);
router.post('/bulk-import', requireAdmin, bulkImportDepartments);
router.post('/', requireAdmin, createDepartment);
router.put('/:id', requireAdmin, updateDepartment);
router.delete('/:id', requireAdmin, deleteDepartment);

module.exports = router;
