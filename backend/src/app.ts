import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z, ZodError } from 'zod';
import multipart from '@fastify/multipart';
import { randomInt, randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { pipeline } from 'stream/promises';
import { PrismaClient } from '@prisma/client';
import { computeSummary } from './summary';

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: number }; user: { sub: number } }
}

const phoneSchema = z.string().regex(/^\+?\d{10,13}$/, 'Invalid phone number');
const loanSchema = z.object({
  friendName: z.string().trim().min(1).max(60),
  amount: z.number().int().positive().max(10_000_000),
  dueDate: z.coerce.date(),
});
const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MIME_TO_EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const EXT_TO_MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const idParam = z.object({ id: z.coerce.number().int().positive() });

export function buildApp(prisma = new PrismaClient()) {
  const app = Fastify({ logger: true });
  app.register(cors);
  app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret' });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: err.flatten() });
    reply.send(err);
  });

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'Unauthorized' }); }
  };

  // --- Auth (mock OTP: printed to server log) ---
  app.post('/auth/request-otp', async (req) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
    const code = String(randomInt(100000, 1000000));
    await prisma.otp.deleteMany({ where: { phone } });
    await prisma.otp.create({ data: { phone, code, expiresAt: new Date(Date.now() + 5 * 60_000) } });
    console.log(`\n>>> OTP for ${phone}: ${code}\n`);
    return { ok: true };
  });

  app.post('/auth/verify-otp', async (req, reply) => {
    const { phone, otp } = z.object({ phone: phoneSchema, otp: z.string().length(6) }).parse(req.body);
    const rec = await prisma.otp.findFirst({ where: { phone }, orderBy: { id: 'desc' } });
    if (!rec || rec.code !== otp || rec.expiresAt < new Date())
      return reply.code(401).send({ error: 'Invalid or expired OTP' });
    await prisma.otp.deleteMany({ where: { phone } });
    const user = await prisma.user.upsert({ where: { phone }, update: {}, create: { phone } });
    return { token: app.jwt.sign({ sub: user.id }, { expiresIn: '7d' }) };
  });

  // --- Loans ---
  app.post('/loans', { preHandler: auth }, async (req, reply) => {
    const data = loanSchema.parse(req.body);
    const loan = await prisma.loan.create({ data: { ...data, userId: req.user.sub } });
    return reply.code(201).send(loan);
  });

  app.get('/loans', { preHandler: auth }, async (req) =>
    prisma.loan.findMany({ where: { userId: req.user.sub }, orderBy: { dueDate: 'asc' } }));

  app.post('/loans/:id/repay', { preHandler: auth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const loan = await prisma.loan.findFirst({ where: { id, userId: req.user.sub } });
    if (!loan) return reply.code(404).send({ error: 'Not found' });
    if (loan.repaidAt) return reply.code(409).send({ error: 'Already repaid' });
    return prisma.loan.update({ where: { id }, data: { repaidAt: new Date() } });
  });

  // --- Receipt photo (bonus): saved on disk, served only to the owner ---
  app.post('/loans/:id/receipt', { preHandler: auth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const loan = await prisma.loan.findFirst({ where: { id, userId: req.user.sub } });
    if (!loan) return reply.code(404).send({ error: 'Not found' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });
    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) return reply.code(415).send({ error: 'Only JPEG, PNG or WebP images allowed' });

    await mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${id}-${randomUUID()}${ext}`;
    const dest = join(UPLOAD_DIR, name);
    await pipeline(file.file, createWriteStream(dest));
    if (file.file.truncated) {
      await unlink(dest).catch(() => {});
      return reply.code(413).send({ error: 'File too large (max 5 MB)' });
    }
    if (loan.receiptPath) await unlink(join(UPLOAD_DIR, basename(loan.receiptPath))).catch(() => {});
    return prisma.loan.update({ where: { id }, data: { receiptPath: name } });
  });

  app.get('/loans/:id/receipt', { preHandler: auth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const loan = await prisma.loan.findFirst({ where: { id, userId: req.user.sub } });
    if (!loan?.receiptPath) return reply.code(404).send({ error: 'No receipt' });
    const name = basename(loan.receiptPath);
    const ext = name.slice(name.lastIndexOf('.'));
    return reply.type(EXT_TO_MIME[ext] ?? 'application/octet-stream').send(createReadStream(join(UPLOAD_DIR, name)));
  });

  app.get('/summary', { preHandler: auth }, async (req) =>
    computeSummary(await prisma.loan.findMany({ where: { userId: req.user.sub } })));

  return app;
}
