# ForeignMart web

A standalone Next.js storefront for web browsers. The Flutter project remains the mobile app, and this app uses the existing ForeignMart backend API.

## Run locally

1. Start the backend with its `local` profile on port `8080`.
2. Copy `.env.example` to `.env.local` if the backend URL differs from `http://localhost:8080/api/v1`.
3. Run `npm install`, then `npm run dev` and open [http://localhost:3000](http://localhost:3000).

Catalog and category browsing works without signing in. A customer can also sign in or create an account at any time. Checkout asks the customer to sign in, syncs the guest bag to the existing cart endpoints, and uses an existing delivery address or collects a Japanese-format address before placing the order.

The local backend profile currently allows localhost origins. For a deployed web app, configure the backend's allowed CORS origin through its existing configuration; this app does not change backend files.
