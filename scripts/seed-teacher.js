#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const phone = process.env.TEACHER_PHONE || '+15551234567';
  const name = process.env.TEACHER_NAME || 'Test Teacher';
  const email = process.env.TEACHER_EMAIL || 'teacher@example.com';

  console.log('Using phone:', phone);

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log('Teacher already exists:', existing.id, existing.phone);
    return;
  }

  const user = await prisma.user.create({
    data: {
      name,
      phone,
      email,
      role: 'teacher'
    }
  });

  console.log('Created teacher user:', user.id, user.phone);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
