# FOS Collection Management App

A full-stack mobile application for Field Officer (FOS) loan collection management, built with Expo React Native and Express.js.

## App Overview

This app allows FOS (Field Officer Sales) agents to manage loan collection cases, track attendance, view salary details, and handle depositions. An admin panel provides consolidated views of all agent data.

## Architecture

- **Frontend**: Expo React Native (port 8081) with Expo Router file-based navigation
- **Backend**: Express.js (port 5000) with PostgreSQL database
- **Database**: PostgreSQL via Replit's built-in database

## Database Tables

- `fos_agents` - Agent accounts (FOS agents + Admin)
- `loan_cases` - Customer loan data with status tracking (Unpaid/Follow Up/PTP/Paid)
- `attendance` - Agent check-in/check-out records
- `salary_details` - Monthly salary breakdowns
- `depositions` - Payment deposition records

## Default Credentials

- **Admin**: username `admin`, password `admin123`
- **FOS Agents**: `hirasingh`, `santosh`, `ramesh` (passwords are randomly generated at account creation time)

## App Features

### FOS Agent App
- **Dashboard**: Total cases, paid cases, unpaid breakdown (Not Process + Follow Up + PTP), today's collection
- **Allocation**: Cases grouped by status (Unpaid/Follow Up/PTP/Paid) with search, Call & Feedback buttons
- **Customer Details**: Full loan details with clickable phone numbers
- **Feedback System**: Update case status with predefined feedback options and comments
- **Performance**: Collection rate, bucket-wise summary, progress bars
- **Salary Details**: Monthly salary records with all components
- **ID Card**: Employee identity card view
- **Ready Payment**: Lists all PTP (Promise to Pay) cases
- **Deposition**: Record and view payment depositions
- **Mark Attendance**: Check In / Check Out
- **Change Password**: Secure password update
- **Sidebar Navigation**: Drawer menu with all features

### Admin Panel
- **Dashboard**: All agents' stats at a glance with collection rates
- **All Cases**: Filterable view of all loan cases across all agents
- **Salary Management**: View and add salary records for any agent
- **Depositions**: All depositions across all agents
- **Attendance**: All attendance records
- **Agent Detail**: Individual agent's cases and stats

## File Structure

```
app/
  _layout.tsx          # Root layout with AuthContext
  index.tsx            # Loading/redirect screen
  login.tsx            # Login screen
  (app)/               # Authenticated FOS agent routes
    _layout.tsx        # Sidebar drawer layout
    dashboard.tsx      # Main dashboard
    allocation.tsx     # Case allocation with tabs
    customer/[id].tsx  # Customer details
    performance.tsx    # Performance metrics
    salary.tsx         # Salary details
    id-card.tsx        # Employee ID card
    ready-payment.tsx  # PTP cases
    deposition.tsx     # Depositions
    change-password.tsx # Change password
  (admin)/             # Admin-only routes
    _layout.tsx        # Admin sidebar drawer
    index.tsx          # Admin dashboard
    all-cases.tsx      # All cases view
    salary.tsx         # Salary management
    depositions.tsx    # All depositions
    attendance.tsx     # Attendance records
    agent/[id].tsx     # Individual agent view

context/
  AuthContext.tsx      # Authentication state

lib/
  api.ts               # API client helper
  query-client.ts      # React Query configuration

server/
  index.ts             # Express server setup
  routes.ts            # All API routes
  storage.ts           # Database query functions

constants/
  colors.ts            # App color theme (green scheme)
```

## Color Theme

Primary green theme inspired by collection/finance apps:
- Primary: #1a6e3c (Dark green)
- Primary Light: #2d9b5a
- Primary Dark: #0f2318
- Status Colors: Red (Unpaid), Amber (Follow Up), Blue (PTP), Green (Paid)
