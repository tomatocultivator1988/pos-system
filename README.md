# GreenPOS - Modern Point of Sale System

A minimalistic, green-themed POS system built with **Next.js 16**, **React**, and **Tailwind CSS**. The design follows modern Scandinavian UI principles with generous whitespace, restrained effects, and clear visual hierarchy.

## Design System

### Color Palette
- **Background**: Off-white (`#fafbf9`)
- **Accent (Green)**: `hsl(140 71% 45%)` - Primary action color
- **Neutrals**: White, light grays for cards and backgrounds
- **Text**: Dark green-tinted foreground for natural readability

### Typography
- **Font**: Geist (optimized for web)
- **Spacing**: Strict 8px scale
- **Corners**: 12-16px radius for cards and buttons
- **Animations**: Fast (150-200ms), subtle and purposeful

### Key Features
- Clean, airy layouts with abundant whitespace
- Soft borders and rounded corners
- Very light, infrequent shadows
- Clear visual hierarchy
- Premium feel through clarity, not decoration

## Project Structure

```
├── app/
│   ├── page.tsx              # Dashboard (Main)
│   ├── terminal/page.tsx     # POS Terminal (Checkout)
│   ├── inventory/page.tsx    # Inventory Management
│   ├── layout.tsx            # Root layout with Geist font
│   └── globals.css           # Tailwind v4 theme tokens
├── components/
│   ├── header.tsx            # Top navigation bar
│   ├── navigation.tsx        # Left sidebar navigation
│   ├── stat-card.tsx         # KPI stat display card
│   └── dashboard-card.tsx    # Reusable card wrapper
└── package.json
```

## Pages

### 1. Dashboard (`/`)
Main overview with:
- Welcome greeting
- Key metrics (Today's Sales, Active Orders, Inventory, Customers)
- Weekly sales trend chart (Line chart)
- Inventory status chart (Bar chart)
- Quick action cards for common tasks

### 2. POS Terminal (`/terminal`)
Interactive checkout interface:
- Product grid with 12 sample items (responsive)
- Real-time cart with add/remove/quantity controls
- Order summary with subtotal, tax, and total
- Payment method selection (Cash/Card)
- Fully functional cart calculations

### 3. Inventory Management (`/inventory`)
Stock management dashboard:
- Search by product name or SKU
- Filter by stock status (In Stock, Low Stock, Out of Stock)
- Full product table with stock levels, prices, and status badges
- Summary statistics at the bottom
- Color-coded status indicators

## Getting Started

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
pnpm build
pnpm start
```

## Color Theme

The theme is defined in `app/globals.css` using CSS custom properties:

```css
--background: oklch(0.995 0 0);        /* Off-white */
--foreground: oklch(0.2 0.02 160);     /* Dark green-tinted text */
--accent: oklch(0.6 0.2 160);          /* Vibrant green */
--card: oklch(1 0 0);                  /* White */
--muted: oklch(0.94 0 0);              /* Light gray */
--border: oklch(0.91 0 0);             /* Subtle borders */
```

## Responsive Design

All pages are mobile-first and responsive:
- Mobile: Single column layouts
- Tablet (md breakpoint): 2-3 columns
- Desktop (lg breakpoint): Full multi-column layouts

## Interactive Features

- **Navigation**: Active state highlighting for current page
- **Cart Management**: Add, remove, update quantities with real-time calculations
- **Search & Filter**: Live filtering on inventory page
- **Payment Selection**: Interactive toggle between payment methods
- **Hover Effects**: Subtle transitions and state changes

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4 with custom theme tokens
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **Font**: Geist from Google Fonts
- **State Management**: React hooks (useState)

## Components

### Header
Top navigation bar with GreenPOS branding and action buttons (notifications, settings, logout).

### Navigation
Left sidebar with 6 main sections: Dashboard, POS Terminal, Inventory, Reports, Customers, Settings. Active states indicated with green accent.

### StatCard
Displays key metrics with icon, value, and change indicator (positive/negative).

### DashboardCard
Wrapper component for chart containers with title and subtitle.

## Future Enhancements

- Backend integration with Neon/Supabase
- Real database for products and transactions
- User authentication
- Receipt printing
- Additional reports (Profit, Receivables, etc.)
- Customer management
- Multi-store support
- Dark mode variant

## License

MIT
