import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import eventsRoutes from './routes/events.js';
import membersRoutes from './routes/members.js';
import tasksRoutes from './routes/tasks.js';
import sponsorsRoutes from './routes/sponsors.js';
import artistsRoutes from './routes/artists.js';
import stallsRoutes from './routes/stalls.js';
import budgetRoutes from './routes/budget.js';
import expensesRoutes from './routes/expenses.js';
import documentsRoutes from './routes/documents.js';
import notificationsRoutes from './routes/notifications.js';
import commentsRoutes from './routes/comments.js';
import sponsorContractsRoutes from './routes/sponsorContracts.js';
import sponsorPaymentsRoutes from './routes/sponsorPayments.js';
import artistTravelRoutes from './routes/artistTravel.js';
import artistPaymentsRoutes from './routes/artistPayments.js';
import expensePoliciesRoutes from './routes/expensePolicies.js';
import reportsRoutes from './routes/reports.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/events/:eventId/members', membersRoutes);
app.use('/api/events/:eventId/tasks', tasksRoutes);
app.use('/api/events/:eventId/sponsors', sponsorsRoutes);
app.use('/api/events/:eventId/sponsors/:sponsorId/contracts', sponsorContractsRoutes);
app.use('/api/events/:eventId/sponsors/:sponsorId/payments', sponsorPaymentsRoutes);
app.use('/api/events/:eventId/artists/:artistId/travel-legs', artistTravelRoutes);
app.use('/api/events/:eventId/artists/:artistId/payments', artistPaymentsRoutes);
app.use('/api/events/:eventId/expense-policies', expensePoliciesRoutes);
app.use('/api/events/:eventId/reports', reportsRoutes);
app.use('/api/events/:eventId/artists', artistsRoutes);
app.use('/api/events/:eventId/stalls', stallsRoutes);
app.use('/api/events/:eventId/budget-lines', budgetRoutes);
app.use('/api/events/:eventId/expenses', expensesRoutes);
app.use('/api/events/:eventId/documents', documentsRoutes);
app.use('/api/events/:eventId/notifications', notificationsRoutes);
app.use('/api/events/:eventId/comments', commentsRoutes);

// Central error handler — every route's catch(next) lands here
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Runway API listening on :${port}`));
