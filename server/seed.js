const { seedUsers } = require('./auth');
seedUsers();
console.log('Users ensured. Logins: admin/admin123, finance/finance123, client/client123');
process.exit(0);